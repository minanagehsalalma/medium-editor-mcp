import { config } from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

config();

export interface ImportedCookie {
  domain?: string;
  expirationDate?: number;
  httpOnly?: boolean;
  name: string;
  path?: string;
  sameSite?: string | null;
  secure?: boolean;
  session?: boolean;
  value: string;
}

export interface MediumCookieSession {
  cookies: ImportedCookie[];
  cookieHeader: string;
  xsrfToken: string | null;
}

export interface MediumCookieValidationIssue {
  code: string;
  message: string;
  severity: 'info' | 'warning';
}

export interface MediumCookieValidationResult {
  cookieCount: number;
  cookieNames: string[];
  hasXsrfToken: boolean;
  issues: MediumCookieValidationIssue[];
  missingRequiredCookies: string[];
}

export interface MediumSessionConfigInspection {
  availableSources: string[];
  configuredValues: {
    cookieFile: string | null;
    cookieHeader: boolean;
    cookiesJson: boolean;
    graphqlOperationsFile: string | null;
  };
  loadError: string | null;
  resolvedCookieFile: string | null;
  sessionSummary: {
    cookieCount: number;
    cookieNames: string[];
    cookiePreview: string[];
    hasXsrfToken: boolean;
  } | null;
  validation: MediumCookieValidationResult | null;
}

function redactCookieValue(value: string) {
  if (value.length <= 8) {
    return '***';
  }

  return `${value.slice(0, 4)}...${value.slice(-2)}`;
}

export function buildSafeMediumSessionSummary(session: MediumCookieSession) {
  return {
    cookieCount: session.cookies.length,
    cookieNames: [...new Set(session.cookies.map((cookie) => cookie.name))],
    cookiePreview: session.cookies.map((cookie) => `${cookie.name}=${redactCookieValue(cookie.value)}`),
    hasXsrfToken: Boolean(session.xsrfToken)
  };
}

function isCookieLike(value: unknown): value is ImportedCookie {
  return Boolean(
    value &&
      typeof value === 'object' &&
      typeof (value as ImportedCookie).name === 'string' &&
      typeof (value as ImportedCookie).value === 'string'
  );
}

export function normalizeImportedCookies(cookies: unknown[]): ImportedCookie[] {
  return cookies
    .filter(isCookieLike)
    .map((cookie) => ({
      domain: cookie.domain,
      expirationDate: cookie.expirationDate,
      httpOnly: cookie.httpOnly,
      name: cookie.name.trim(),
      path: cookie.path,
      sameSite: cookie.sameSite,
      secure: cookie.secure,
      session: cookie.session,
      value: cookie.value
    }))
    .filter((cookie) => cookie.name.length > 0);
}

export function parseRawCookieHeader(cookieHeader: string): ImportedCookie[] {
  return cookieHeader
    .split(';')
    .map((pair) => pair.trim())
    .filter(Boolean)
    .map((pair) => {
      const separatorIndex = pair.indexOf('=');
      const name = separatorIndex >= 0 ? pair.slice(0, separatorIndex).trim() : pair.trim();
      const value = separatorIndex >= 0 ? pair.slice(separatorIndex + 1).trim() : '';

      return {
        domain: 'medium.com',
        path: '/',
        name,
        value,
        secure: true
      } satisfies ImportedCookie;
    });
}

export function parseNetscapeCookieFile(cookieText: string): ImportedCookie[] {
  return cookieText
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))
    .map((line) => line.split('\t'))
    .filter((parts) => parts.length >= 7)
    .map((parts) => {
      const [domain, , cookiePath, secure, expirationDate, name, ...valueParts] = parts;
      return {
        domain,
        path: cookiePath || '/',
        secure: secure.toUpperCase() === 'TRUE',
        expirationDate: Number(expirationDate) || undefined,
        name,
        value: valueParts.join('\t')
      } satisfies ImportedCookie;
    })
    .filter((cookie) => cookie.name.trim().length > 0);
}

export function parseCookieJsonValue(raw: string): ImportedCookie[] {
  const parsed = JSON.parse(raw) as unknown;
  if (Array.isArray(parsed)) {
    return normalizeImportedCookies(parsed);
  }

  if (parsed && typeof parsed === 'object' && Array.isArray((parsed as any).cookies)) {
    return normalizeImportedCookies((parsed as any).cookies);
  }

  throw new Error('Expected a JSON cookie array or an object with a cookies array.');
}

export function parseCookieSourceText(raw: string): ImportedCookie[] {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error('Cookie source was empty.');
  }

  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    return parseCookieJsonValue(trimmed);
  }

  if (/^#\s*HTTP Cookie File/i.test(trimmed) || trimmed.includes('\tTRUE\t') || trimmed.includes('\tFALSE\t')) {
    const cookies = parseNetscapeCookieFile(trimmed);
    if (cookies.length) {
      return cookies;
    }
  }

  if (trimmed.includes('=') && !trimmed.includes('\n')) {
    return parseRawCookieHeader(trimmed.replace(/^Cookie:\s*/i, ''));
  }

  throw new Error('Unsupported cookie source format. Provide JSON, a raw Cookie header, or a Netscape cookie file.');
}

export function serializeCookies(cookies: ImportedCookie[]): string {
  return cookies
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join('; ');
}

export function getCookieValue(cookies: ImportedCookie[], name: string): string | null {
  const target = cookies.find((cookie) => cookie.name === name);
  return target?.value || null;
}

export function validateMediumCookies(cookies: ImportedCookie[]): MediumCookieValidationResult {
  const cookieNames = [...new Set(cookies.map((cookie) => cookie.name))];
  const issues: MediumCookieValidationIssue[] = [];
  const requiredNames = ['sid', 'uid', 'xsrf'];
  const missingRequiredCookies = requiredNames.filter((name) => !cookieNames.includes(name));
  const nowSeconds = Math.floor(Date.now() / 1000);

  if (!cookies.length) {
    issues.push({
      code: 'no_cookies',
      severity: 'warning',
      message: 'No cookies were parsed from the configured source.'
    });
  }

  if (missingRequiredCookies.length) {
    issues.push({
      code: 'missing_required_cookies',
      severity: 'warning',
      message: `Missing required Medium session cookies: ${missingRequiredCookies.join(', ')}.`
    });
  }

  const expiredNames = cookies
    .filter((cookie) => typeof cookie.expirationDate === 'number' && cookie.expirationDate > 0 && cookie.expirationDate < nowSeconds)
    .map((cookie) => cookie.name);

  if (expiredNames.length) {
    issues.push({
      code: 'expired_cookies_present',
      severity: 'info',
      message: `Some configured cookies appear expired: ${[...new Set(expiredNames)].join(', ')}.`
    });
  }

  const mediumDomainCount = cookies.filter((cookie) => (cookie.domain || '').includes('medium.com')).length;
  if (mediumDomainCount === 0) {
    issues.push({
      code: 'no_medium_domains',
      severity: 'info',
      message: 'None of the configured cookies declare a medium.com domain.'
    });
  }

  return {
    cookieCount: cookies.length,
    cookieNames,
    hasXsrfToken: cookieNames.includes('xsrf'),
    missingRequiredCookies,
    issues,
  };
}

export function inspectMediumSessionConfig(): MediumSessionConfigInspection {
  const inlineJson = process.env.MEDIUM_COOKIES_JSON?.trim();
  const cookieFile = process.env.MEDIUM_COOKIES_FILE?.trim();
  const rawCookieHeader = process.env.MEDIUM_COOKIE_HEADER?.trim();
  const graphqlOperationsFile = process.env.MEDIUM_GRAPHQL_OPERATIONS_FILE?.trim() || null;

  const availableSources = [
    ...(inlineJson ? ['MEDIUM_COOKIES_JSON'] : []),
    ...(cookieFile ? ['MEDIUM_COOKIES_FILE'] : []),
    ...(rawCookieHeader ? ['MEDIUM_COOKIE_HEADER'] : [])
  ];

  try {
    const session = loadMediumSessionCookies();
    return {
      availableSources,
      configuredValues: {
        cookieFile: cookieFile || null,
        cookieHeader: Boolean(rawCookieHeader),
        cookiesJson: Boolean(inlineJson),
        graphqlOperationsFile
      },
      loadError: null,
      resolvedCookieFile: cookieFile ? path.resolve(cookieFile) : null,
      validation: validateMediumCookies(session.cookies),
      sessionSummary: buildSafeMediumSessionSummary(session)
    };
  } catch (error: any) {
    return {
      availableSources,
      configuredValues: {
        cookieFile: cookieFile || null,
        cookieHeader: Boolean(rawCookieHeader),
        cookiesJson: Boolean(inlineJson),
        graphqlOperationsFile
      },
      loadError: error.message,
      resolvedCookieFile: cookieFile ? path.resolve(cookieFile) : null,
      validation: null,
      sessionSummary: null
    };
  }
}

export function loadMediumSessionCookies(): MediumCookieSession {
  const inlineJson = process.env.MEDIUM_COOKIES_JSON?.trim();
  const cookieFile = process.env.MEDIUM_COOKIES_FILE?.trim();
  const rawCookieHeader = process.env.MEDIUM_COOKIE_HEADER?.trim();

  let cookies: ImportedCookie[];

  if (inlineJson) {
    cookies = parseCookieSourceText(inlineJson);
  } else if (cookieFile) {
    const resolved = path.resolve(cookieFile);
    cookies = parseCookieSourceText(fs.readFileSync(resolved, 'utf-8'));
  } else if (rawCookieHeader) {
    cookies = parseCookieSourceText(rawCookieHeader);
  } else {
    throw new Error(
      'No Medium session cookies configured. Set MEDIUM_COOKIES_FILE, MEDIUM_COOKIES_JSON, or MEDIUM_COOKIE_HEADER.'
    );
  }

  return {
    cookies,
    cookieHeader: serializeCookies(cookies),
    xsrfToken: getCookieValue(cookies, 'xsrf')
  };
}
