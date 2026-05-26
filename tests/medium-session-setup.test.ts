import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  inspectMediumSessionConfig,
  parseCookieSourceText,
  validateMediumCookies
} from '../src/medium-session';
import { setupMediumSession } from '../src/medium-session-setup';

describe('Medium session parsing', () => {
  afterEach(() => {
    delete process.env.MEDIUM_COOKIES_FILE;
    delete process.env.MEDIUM_COOKIES_JSON;
    delete process.env.MEDIUM_COOKIE_HEADER;
    delete process.env.MEDIUM_GRAPHQL_OPERATIONS_FILE;
  });

  it('parses a wrapped cookies object', () => {
    const cookies = parseCookieSourceText(JSON.stringify({
      cookies: [
        { name: 'sid', value: 'abc' },
        { name: 'uid', value: 'def' },
        { name: 'xsrf', value: 'ghi' }
      ]
    }));

    expect(cookies.map((cookie) => cookie.name)).toEqual(['sid', 'uid', 'xsrf']);
  });

  it('parses a Netscape cookie file', () => {
    const cookies = parseCookieSourceText([
      '# Netscape HTTP Cookie File',
      '.medium.com\tTRUE\t/\tTRUE\t1893456000\tsid\tabc',
      '.medium.com\tTRUE\t/\tTRUE\t1893456000\tuid\tdef',
      'medium.com\tFALSE\t/\tTRUE\t1893456000\txsrf\tghi'
    ].join('\n'));

    expect(cookies).toEqual([
      expect.objectContaining({ name: 'sid', value: 'abc' }),
      expect.objectContaining({ name: 'uid', value: 'def' }),
      expect.objectContaining({ name: 'xsrf', value: 'ghi' })
    ]);
  });

  it('validates missing required cookies clearly', () => {
    const validation = validateMediumCookies([
      { name: 'sid', value: 'abc' }
    ]);

    expect(validation.missingRequiredCookies).toEqual(['uid', 'xsrf']);
    expect(validation.issues.map((issue) => issue.code)).toContain('missing_required_cookies');
  });
});

describe('setupMediumSession', () => {
  afterEach(() => {
    delete process.env.MEDIUM_COOKIES_FILE;
    delete process.env.MEDIUM_COOKIES_JSON;
    delete process.env.MEDIUM_COOKIE_HEADER;
    delete process.env.MEDIUM_GRAPHQL_OPERATIONS_FILE;
  });

  it('writes a session file, updates env, and sets process env from a raw cookie header', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'medium-session-'));
    const envFile = path.join(tempDir, '.env');
    const sessionFile = path.join(tempDir, 'medium-cookies.json');

    const result = setupMediumSession({
      cookieHeader: 'sid=abc; uid=def; xsrf=ghi',
      envFile,
      sessionFile
    });

    expect(fs.existsSync(sessionFile)).toBe(true);
    expect(fs.readFileSync(envFile, 'utf-8')).toContain(`MEDIUM_COOKIES_FILE=${sessionFile}`);
    expect(process.env.MEDIUM_COOKIES_FILE).toBe(sessionFile);
    expect(result.validation.missingRequiredCookies).toEqual([]);
    expect(result.configInspection.validation?.cookieCount).toBe(3);
  });

  it('inspects a configured session file source', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'medium-session-inspect-'));
    const sessionFile = path.join(tempDir, 'medium-cookies.json');
    fs.writeFileSync(
      sessionFile,
      JSON.stringify([
        { name: 'sid', value: 'abc', domain: '.medium.com' },
        { name: 'uid', value: 'def', domain: '.medium.com' },
        { name: 'xsrf', value: 'ghi', domain: 'medium.com' }
      ]),
      'utf-8'
    );

    process.env.MEDIUM_COOKIES_FILE = sessionFile;
    const inspection = inspectMediumSessionConfig();

    expect(inspection.loadError).toBeNull();
    expect(inspection.resolvedCookieFile).toBe(sessionFile);
    expect(inspection.validation?.missingRequiredCookies).toEqual([]);
    expect(inspection.sessionSummary?.hasXsrfToken).toBe(true);
    expect(inspection.sessionSummary?.cookiePreview[0]).not.toContain('abc');
  });
});
