import { config } from 'dotenv';
import axios from 'axios';
import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import { loadMediumSessionCookies } from './medium-session';

config();

const execFileAsync = promisify(execFile);

export interface MediumGraphqlRequest {
  body?: Record<string, unknown>;
  endpoint?: string;
  headers?: Record<string, string>;
  referer?: string;
  source?: string;
}

export interface MediumGraphqlOperation {
  body: Record<string, unknown>;
  endpoint?: string;
  headers?: Record<string, string>;
  referer?: string;
  source?: string;
}

interface MediumGraphqlRegistry {
  operations: Record<string, MediumGraphqlOperation>;
}

export interface MediumGraphqlRuntimeInspection {
  cycleTlsScript: string;
  defaultEndpoint: string;
  defaultReferer: string;
  defaultSource: string;
  registryAliases: string[];
  registryPath: string | null;
  transport: 'axios' | 'cycletls';
  userAgent: string;
}

class MediumGraphqlClient {
  private defaultEndpoint = process.env.MEDIUM_GRAPHQL_ENDPOINT?.trim() || 'https://medium.com/_/graphql';
  private defaultSource = process.env.MEDIUM_GRAPHQL_SOURCE?.trim() || 'codex-medium-mcp';
  private defaultReferer = process.env.MEDIUM_GRAPHQL_REFERER?.trim() || 'https://medium.com/me/stories/drafts';
  private defaultUserAgent =
    process.env.MEDIUM_GRAPHQL_USER_AGENT?.trim() ||
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36';
  private cycleTlsScript =
    process.env.MEDIUM_CYCLETLS_SCRIPT?.trim() ||
    path.join(process.env.USERPROFILE || 'C:\\Users\\ASUS', '.codex', 'skills', 'cycletls-fingerprint-requests', 'scripts', 'cycletls_request.js');

  private getTransport(): 'axios' | 'cycletls' {
    const forced = process.env.MEDIUM_GRAPHQL_TRANSPORT?.trim().toLowerCase();
    if (forced === 'axios' || forced === 'cycletls') {
      return forced;
    }

    return fs.existsSync(this.cycleTlsScript) ? 'cycletls' : 'axios';
  }

  private buildUrl(endpoint: string, source?: string): string {
    const url = new URL(endpoint);
    const finalSource = source || this.defaultSource;
    if (finalSource && !url.searchParams.has('source')) {
      url.searchParams.set('source', finalSource);
    }
    return url.toString();
  }

  private buildHeaders(extraHeaders?: Record<string, string>, referer?: string): Record<string, string> {
    const session = loadMediumSessionCookies();
    const headers: Record<string, string> = {
      'Accept': 'application/json, text/plain, */*',
      'Content-Type': 'application/json',
      'Cookie': session.cookieHeader,
      'Origin': 'https://medium.com',
      'Referer': referer || this.defaultReferer,
      'User-Agent': this.defaultUserAgent,
      ...extraHeaders
    };

    if (session.xsrfToken && !headers['x-xsrf-token']) {
      headers['x-xsrf-token'] = session.xsrfToken;
    }

    return headers;
  }

  private getRegistryPath(): string | null {
    const envPath = process.env.MEDIUM_GRAPHQL_OPERATIONS_FILE?.trim();
    if (envPath) {
      return path.resolve(envPath);
    }

    const repoDefault = path.join(process.cwd(), 'medium-operations.json');
    return fs.existsSync(repoDefault) ? repoDefault : null;
  }

  private loadRegistry(): MediumGraphqlRegistry {
    const registryPath = this.getRegistryPath();
    if (!registryPath) {
      throw new Error(
        'No Medium GraphQL operations registry found. Set MEDIUM_GRAPHQL_OPERATIONS_FILE or create medium-operations.json.'
      );
    }

    const raw = fs.readFileSync(registryPath, 'utf-8');
    return JSON.parse(raw) as MediumGraphqlRegistry;
  }

  private async requestViaCycleTls(
    method: 'GET' | 'POST',
    url: string,
    headers: Record<string, string>,
    body?: Record<string, unknown>
  ) {
    const args = [
      this.cycleTlsScript,
      '--url',
      url,
      '--method',
      method,
      '--options-json',
      JSON.stringify({
        headers,
        responseType: 'text'
      })
    ];

    if (body !== undefined) {
      args.push('--body', JSON.stringify(body));
    }

    const { stdout } = await execFileAsync(process.execPath, args, {
      maxBuffer: 10 * 1024 * 1024
    });

    const parsed = JSON.parse(stdout);
    return {
      status: parsed.status as number,
      headers: (parsed.headers || {}) as Record<string, string>,
      data: parsed.data,
      finalUrl: parsed.finalUrl as string | undefined
    };
  }

  public async fetchText(url: string, referer?: string) {
    const headers = this.buildHeaders(
      {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      referer
    );
    const transport = this.getTransport();

    if (transport === 'cycletls') {
      const response = await this.requestViaCycleTls('GET', url, headers);
      return {
        status: response.status,
        url,
        finalUrl: response.finalUrl || url,
        headers: response.headers,
        data: typeof response.data === 'string' ? response.data : JSON.stringify(response.data)
      };
    }

    const response = await axios.get(url, {
      headers,
      validateStatus: () => true
    });

    return {
      status: response.status,
      url,
      finalUrl: (response.request?.res?.responseUrl as string | undefined) || url,
      headers: response.headers as Record<string, string>,
      data: typeof response.data === 'string' ? response.data : JSON.stringify(response.data)
    };
  }

  public inspectRuntime(): MediumGraphqlRuntimeInspection {
    const registryPath = this.getRegistryPath();
    let registryAliases: string[] = [];

    if (registryPath && fs.existsSync(registryPath)) {
      try {
        const registry = JSON.parse(fs.readFileSync(registryPath, 'utf-8')) as MediumGraphqlRegistry;
        registryAliases = Object.keys(registry.operations || {});
      } catch {
        registryAliases = [];
      }
    }

    return {
      defaultEndpoint: this.defaultEndpoint,
      defaultReferer: this.defaultReferer,
      defaultSource: this.defaultSource,
      transport: this.getTransport(),
      cycleTlsScript: this.cycleTlsScript,
      registryPath,
      registryAliases,
      userAgent: this.defaultUserAgent
    };
  }

  public async probeSession(): Promise<{
    authenticated: boolean;
    location: string | null;
    status: number;
    url: string;
  }> {
    const headers = this.buildHeaders();
    const transport = this.getTransport();

    let status: number;
    let location: string | null = null;
    let finalUrl: string | null = null;

    if (transport === 'cycletls') {
      const response = await this.requestViaCycleTls('GET', 'https://medium.com/me/stories/drafts', headers);
      status = response.status;
      finalUrl = response.finalUrl || null;
      location = finalUrl && finalUrl !== 'https://medium.com/me/stories/drafts' ? finalUrl : null;
    } else {
      const response = await axios.get('https://medium.com/me/stories/drafts', {
        headers,
        maxRedirects: 0,
        validateStatus: () => true
      });

      status = response.status;
      location = typeof response.headers.location === 'string' ? response.headers.location : null;
    }

    const authenticated = status === 200 && !(location?.includes('/signin'));

    return {
      authenticated,
      location,
      status,
      url: 'https://medium.com/me/stories/drafts'
    };
  }

  public async execute(request: MediumGraphqlRequest) {
    const endpoint = request.endpoint || this.defaultEndpoint;
    const source = request.source || this.defaultSource;
    const body = request.body || {};

    if (!Object.keys(body).length) {
      throw new Error('GraphQL request body is required.');
    }

    const url = this.buildUrl(endpoint, source);
    const headers = this.buildHeaders(request.headers, request.referer);
    if (typeof body.operationName === 'string' && !headers['Graphql-Operation']) {
      headers['Graphql-Operation'] = body.operationName;
    }
    const transport = this.getTransport();

    const response = transport === 'cycletls'
      ? await this.requestViaCycleTls('POST', url, headers, body)
      : await axios.post(url, body, {
          headers,
          validateStatus: () => true
        });

    return {
      status: response.status,
      url,
      data: response.data,
      headers: response.headers,
      requestSummary: {
        bodyKeys: Object.keys(body),
        headerNames: Object.keys(headers),
        graphqlOperationHeader: headers['Graphql-Operation'] || null,
        operationName: typeof body.operationName === 'string' ? body.operationName : null,
        source
      }
    };
  }

  public async executeRegisteredOperation(alias: string, overrides: Partial<MediumGraphqlOperation> = {}) {
    const registry = this.loadRegistry();
    const operation = registry.operations[alias];

    if (!operation) {
      throw new Error(`No Medium GraphQL operation registered for alias "${alias}".`);
    }

    const mergedBody = {
      ...operation.body,
      ...(overrides.body || {})
    };

    const mergedHeaders = {
      ...(operation.headers || {}),
      ...(overrides.headers || {})
    };

    return this.execute({
      endpoint: overrides.endpoint || operation.endpoint,
      headers: mergedHeaders,
      referer: overrides.referer || operation.referer,
      source: overrides.source || operation.source,
      body: mergedBody
    });
  }
}

export default MediumGraphqlClient;
