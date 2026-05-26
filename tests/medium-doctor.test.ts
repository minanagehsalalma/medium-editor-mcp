import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import MediumDoctor from '../src/medium-doctor';

describe('MediumDoctor', () => {
  afterEach(() => {
    delete process.env.MEDIUM_COOKIES_FILE;
    delete process.env.MEDIUM_COOKIES_JSON;
    delete process.env.MEDIUM_COOKIE_HEADER;
    delete process.env.MEDIUM_GRAPHQL_OPERATIONS_FILE;
  });

  it('reports session, registry, and probe readiness', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'medium-doctor-'));
    const sessionFile = path.join(tempDir, 'medium-cookies.json');
    const registryFile = path.join(tempDir, 'medium-operations.json');

    fs.writeFileSync(
      sessionFile,
      JSON.stringify([
        { name: 'sid', value: 'abc', domain: '.medium.com' },
        { name: 'uid', value: 'def', domain: '.medium.com' },
        { name: 'xsrf', value: 'ghi', domain: 'medium.com' }
      ]),
      'utf-8'
    );
    fs.writeFileSync(
      registryFile,
      JSON.stringify({
        operations: {
          'stage-update-post-metadata': { body: { operationName: 'A' } },
          'set-post-tags': { body: { operationName: 'B' } },
          'set-post-seo-title': { body: { operationName: 'C' } },
          'set-post-seo-description': { body: { operationName: 'D' } },
          'update-canonical-url': { body: { operationName: 'E' } },
          'set-publishing-flow-defaults': { body: { operationName: 'F' } },
          'post-allow-responses': { body: { operationName: 'G' } },
          'create-post-share-key': { body: { operationName: 'H' } },
          'post-settings': { body: { operationName: 'I' } },
          'post-published-dialog': { body: { operationName: 'J' } }
        }
      }),
      'utf-8'
    );

    process.env.MEDIUM_COOKIES_FILE = sessionFile;
    process.env.MEDIUM_GRAPHQL_OPERATIONS_FILE = registryFile;

    const graphqlClient = {
      inspectRuntime: jest.fn().mockReturnValue({
        defaultEndpoint: 'https://medium.com/_/graphql',
        defaultReferer: 'https://medium.com/me/stories/drafts',
        defaultSource: 'codex-medium-mcp',
        transport: 'axios',
        cycleTlsScript: 'C:\\fake\\cycletls.js',
        registryPath: registryFile,
        registryAliases: [
          'stage-update-post-metadata',
          'set-post-tags',
          'set-post-seo-title',
          'set-post-seo-description',
          'update-canonical-url',
          'set-publishing-flow-defaults',
          'post-allow-responses',
          'create-post-share-key',
          'post-settings',
          'post-published-dialog'
        ],
        userAgent: 'UA'
      }),
      probeSession: jest.fn().mockResolvedValue({
        authenticated: true,
        location: null,
        status: 200,
        url: 'https://medium.com/me/stories/drafts'
      })
    } as any;

    const doctor = new MediumDoctor(graphqlClient);
    const result = await doctor.run();

    expect(result.summary.overallReady).toBe(true);
    expect(result.checks.find((check) => check.code === 'session_probe')?.passed).toBe(true);
    expect(result.workflowReadiness.every((item) => item.ready)).toBe(true);
    expect(result.sessionInspection.sessionSummary?.cookiePreview[0]).not.toContain('abc');
  });
});
