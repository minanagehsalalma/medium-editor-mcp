import * as fs from 'fs';
import * as path from 'path';
import {
  ImportedCookie,
  inspectMediumSessionConfig,
  parseCookieSourceText,
  serializeCookies,
  validateMediumCookies
} from './medium-session';

export interface SetupMediumSessionInput {
  cookieHeader?: string;
  cookiesFile?: string;
  cookiesJson?: string;
  envFile?: string;
  sessionFile?: string;
  setProcessEnv?: boolean;
  writeEnvFile?: boolean;
}

export interface SetupMediumSessionResult {
  configInspection: ReturnType<typeof inspectMediumSessionConfig>;
  envAssignments: Record<string, string>;
  envFileUpdated: boolean;
  envFilePath: string | null;
  sessionFilePath: string;
  validation: ReturnType<typeof validateMediumCookies>;
}

function normalizeLineEndings(value: string) {
  return value.replace(/\r\n/g, '\n');
}

function resolveCookieInput(input: SetupMediumSessionInput): ImportedCookie[] {
  const provided = [
    ...(input.cookiesJson?.trim() ? ['cookiesJson'] : []),
    ...(input.cookieHeader?.trim() ? ['cookieHeader'] : []),
    ...(input.cookiesFile?.trim() ? ['cookiesFile'] : [])
  ];

  if (provided.length === 0) {
    throw new Error('Provide cookiesJson, cookieHeader, or cookiesFile.');
  }

  if (provided.length > 1) {
    throw new Error(`Provide exactly one cookie source. Received: ${provided.join(', ')}.`);
  }

  if (input.cookiesJson?.trim()) {
    return parseCookieSourceText(input.cookiesJson.trim());
  }

  if (input.cookieHeader?.trim()) {
    return parseCookieSourceText(input.cookieHeader.trim());
  }

  const resolvedFile = path.resolve(input.cookiesFile!.trim());
  return parseCookieSourceText(fs.readFileSync(resolvedFile, 'utf-8'));
}

function writeEnvAssignments(envFilePath: string, assignments: Record<string, string>) {
  const existing = fs.existsSync(envFilePath)
    ? normalizeLineEndings(fs.readFileSync(envFilePath, 'utf-8'))
    : '';
  const lines = existing ? existing.split('\n') : [];
  const nextLines = [...lines];

  Object.entries(assignments).forEach(([key, value]) => {
    const escapedValue = value.includes(' ') ? `"${value.replace(/"/g, '\\"')}"` : value;
    const assignment = `${key}=${escapedValue}`;
    const existingIndex = nextLines.findIndex((line) => new RegExp(`^${key}=`).test(line));

    if (existingIndex >= 0) {
      nextLines[existingIndex] = assignment;
    } else {
      nextLines.push(assignment);
    }
  });

  const finalText = nextLines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
  fs.writeFileSync(envFilePath, finalText, 'utf-8');
}

export function setupMediumSession(input: SetupMediumSessionInput): SetupMediumSessionResult {
  const cookies = resolveCookieInput(input);
  const validation = validateMediumCookies(cookies);
  const sessionFilePath = path.resolve(input.sessionFile?.trim() || 'medium-cookies.json');
  const envFilePath = input.writeEnvFile === false
    ? null
    : path.resolve(input.envFile?.trim() || '.env');

  fs.writeFileSync(sessionFilePath, JSON.stringify(cookies, null, 2), 'utf-8');

  const envAssignments: Record<string, string> = {
    MEDIUM_COOKIES_FILE: sessionFilePath
  };

  if (input.setProcessEnv !== false) {
    process.env.MEDIUM_COOKIES_FILE = sessionFilePath;
    delete process.env.MEDIUM_COOKIES_JSON;
    delete process.env.MEDIUM_COOKIE_HEADER;
  }

  if (envFilePath) {
    writeEnvAssignments(envFilePath, envAssignments);
  }

  return {
    sessionFilePath,
    envAssignments,
    envFileUpdated: Boolean(envFilePath),
    envFilePath,
    validation,
    configInspection: inspectMediumSessionConfig()
  };
}

export function buildMediumSessionSetupGuide() {
  return {
    acceptedFormats: [
      'Browser-exported JSON cookie arrays',
      'JSON objects with a cookies array',
      'Raw Cookie headers such as "sid=...; uid=...; xsrf=..."',
      'Netscape cookie files from browser export extensions'
    ],
    requiredCookies: ['sid', 'uid', 'xsrf'],
    recommendedWorkflow: [
      'Run setup-medium-session once with your preferred cookie source.',
      'Let the tool write medium-cookies.json and MEDIUM_COOKIES_FILE into .env.',
      'Run probe-medium-session to confirm the session is live before any write workflow.',
      'Re-run setup-medium-session whenever Medium rotates or invalidates the session.'
    ],
    envVariables: ['MEDIUM_COOKIES_FILE', 'MEDIUM_COOKIES_JSON', 'MEDIUM_COOKIE_HEADER']
  };
}

export default setupMediumSession;
