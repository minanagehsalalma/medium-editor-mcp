import { config } from 'dotenv';
import axios from 'axios';
import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import { loadMediumSessionCookies } from './medium-session';

config();

const execFileAsync = promisify(execFile);

export interface MediumLegacyRequest {
  accept?: string;
  body?: unknown;
  contentType?: string;
  headers?: Record<string, string>;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  query?: Record<string, boolean | number | string | undefined>;
  referer?: string;
}

export interface MediumLegacyResponse {
  data: unknown;
  finalUrl: string;
  headers: Record<string, unknown>;
  rawData: string | null;
  requestSummary: {
    hasBody: boolean;
    headerNames: string[];
    method: string;
    path: string;
    queryKeys: string[];
  };
  status: number;
  url: string;
}

export interface MediumUploadImageOptions {
  is2x?: boolean;
  referer?: string;
  source?: number;
}

export interface MediumUploadedImageValue {
  fileId: string;
  fileName?: string;
  fileSize?: number;
  imgHeight: number;
  imgWidth: number;
  md5?: string;
  mimeType?: string;
}

interface CycleTlsResponse {
  data: unknown;
  finalUrl?: string;
  headers: Record<string, string>;
  status: number;
}

export function stripMediumJsonPrefix(value: string): string {
  return value.replace(/^\s*\]\)\}while\(1\);(?:<\/x>)?/, '').trimStart();
}

export function parseMediumResponseBody(value: unknown): {
  data: unknown;
  rawData: string | null;
} {
  if (typeof value !== 'string') {
    return {
      data: value,
      rawData: null
    };
  }

  const normalized = stripMediumJsonPrefix(value);
  try {
    return {
      data: JSON.parse(normalized),
      rawData: value
    };
  } catch {
    return {
      data: normalized,
      rawData: value
    };
  }
}

class MediumLegacyEditorClient {
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

  private buildUrl(pathOrUrl: string, query?: Record<string, boolean | number | string | undefined>): string {
    const url = pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')
      ? new URL(pathOrUrl)
      : new URL(pathOrUrl, 'https://medium.com');

    Object.entries(query || {}).forEach(([key, value]) => {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    });

    return url.toString();
  }

  private buildHeaders(request: MediumLegacyRequest, url: string): Record<string, string> {
    const session = loadMediumSessionCookies();
    const hasBody = request.body !== undefined;
    const headers: Record<string, string> = {
      'Accept': request.accept || 'application/json, text/plain, */*',
      'Cookie': session.cookieHeader,
      'Origin': 'https://medium.com',
      'Referer': request.referer || url,
      'User-Agent': this.defaultUserAgent,
      'X-Requested-With': 'XMLHttpRequest',
      ...(request.headers || {})
    };

    if (hasBody && !headers['Content-Type']) {
      headers['Content-Type'] = request.contentType || 'application/json';
    }

    if (session.xsrfToken && !headers['x-xsrf-token']) {
      headers['x-xsrf-token'] = session.xsrfToken;
    }

    return headers;
  }

  private async requestViaCycleTls(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    url: string,
    headers: Record<string, string>,
    body?: unknown
  ): Promise<CycleTlsResponse> {
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
      args.push('--body', typeof body === 'string' ? body : JSON.stringify(body));
    }

    const { stdout } = await execFileAsync(process.execPath, args, {
      maxBuffer: 10 * 1024 * 1024
    });

    const parsed = JSON.parse(stdout) as CycleTlsResponse;
    return {
      status: parsed.status,
      headers: parsed.headers || {},
      data: parsed.data,
      finalUrl: parsed.finalUrl
    };
  }

  public async request(request: MediumLegacyRequest): Promise<MediumLegacyResponse> {
    const method = request.method || 'GET';
    const url = this.buildUrl(request.path, request.query);
    const headers = this.buildHeaders(request, url);
    const transport = this.getTransport();

    let status: number;
    let finalUrl = url;
    let responseHeaders: Record<string, unknown>;
    let responseData: unknown;

    if (transport === 'cycletls') {
      const response = await this.requestViaCycleTls(method, url, headers, request.body);
      status = response.status;
      finalUrl = response.finalUrl || url;
      responseHeaders = response.headers;
      responseData = response.data;
    } else {
      const response = await axios.request({
        data: request.body,
        headers,
        method,
        url,
        validateStatus: () => true
      });

      status = response.status;
      responseHeaders = response.headers as Record<string, unknown>;
      responseData = response.data;
    }

    const parsedBody = parseMediumResponseBody(responseData);

    return {
      status,
      url,
      finalUrl,
      headers: responseHeaders,
      data: parsedBody.data,
      rawData: parsedBody.rawData,
      requestSummary: {
        method,
        path: request.path,
        queryKeys: Object.keys(request.query || {}),
        headerNames: Object.keys(headers),
        hasBody: request.body !== undefined
      }
    };
  }

  public async createDraft(body: Record<string, unknown> = {}) {
    return this.request({
      method: 'POST',
      path: '/new-story',
      body,
      referer: 'https://medium.com/new-story'
    });
  }

  public async getDraft(postId: string) {
    return this.request({
      path: `/_/api/posts/${postId}/draft`,
      referer: `https://medium.com/p/${postId}/edit`
    });
  }

  public async getPost(postId: string) {
    return this.request({
      path: `/_/api/posts/${postId}`,
      referer: `https://medium.com/p/${postId}/edit`
    });
  }

  public async getDeltas(postId: string, baseRev: number) {
    return this.request({
      path: `/p/${postId}/deltas`,
      query: {
        baseRev
      },
      referer: `https://medium.com/p/${postId}/edit`
    });
  }

  public async getEditState(postId: string) {
    return this.request({
      path: `/p/${postId}/edit`,
      referer: `https://medium.com/p/${postId}/edit`
    });
  }

  public async applyDeltas(postId: string, baseRev: number, deltas: unknown, extraBody: Record<string, unknown> = {}) {
    return this.request({
      method: 'POST',
      path: `/p/${postId}/deltas`,
      body: {
        ...extraBody,
        baseRev,
        deltas
      },
      referer: `https://medium.com/p/${postId}/edit`
    });
  }

  public async publishPost(postId: string) {
    return this.request({
      method: 'POST',
      path: `/p/${postId}/publish`,
      referer: `https://medium.com/p/${postId}/edit`
    });
  }

  public async uploadImageBuffer(buffer: Buffer, filename: string, options: MediumUploadImageOptions = {}) {
    const session = loadMediumSessionCookies();
    const extension = path.extname(filename).toLowerCase();
    const mimeType = extension === '.png'
      ? 'image/png'
      : extension === '.webp'
        ? 'image/webp'
        : extension === '.gif'
          ? 'image/gif'
          : 'image/jpeg';
    const url = this.buildUrl('/_/upload', {
      ...(options.is2x !== undefined ? { is2x: options.is2x } : {}),
      ...(options.source !== undefined ? { source: options.source } : {})
    });
    const headers = this.buildHeaders({
      method: 'POST',
      path: '/_/upload',
      referer: options.referer || 'https://medium.com/new-story'
    }, url);
    delete headers['Content-Type'];

    const form = new FormData();
    form.append('uploadedFile', new Blob([buffer], { type: mimeType }), filename);

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: form
    });
    const responseText = await response.text();
    const parsedBody = parseMediumResponseBody(responseText);

    return {
      status: response.status,
      url,
      finalUrl: response.url || url,
      headers: Object.fromEntries(response.headers.entries()),
      data: parsedBody.data,
      rawData: parsedBody.rawData,
      requestSummary: {
        method: 'POST',
          path: '/_/upload',
          queryKeys: Object.keys({
            ...(options.is2x !== undefined ? { is2x: options.is2x } : {}),
            ...(options.source !== undefined ? { source: options.source } : {})
          }),
        headerNames: Object.keys(headers),
        hasBody: true
      }
    } satisfies MediumLegacyResponse;
  }

  public async uploadImage(filePath: string, options: MediumUploadImageOptions = {}) {
    const buffer = fs.readFileSync(filePath);
    const filename = path.basename(filePath);
    return this.uploadImageBuffer(buffer, filename, options);
  }
}

export default MediumLegacyEditorClient;
