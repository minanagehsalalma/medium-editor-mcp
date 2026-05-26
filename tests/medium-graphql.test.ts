import axios from 'axios';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import MediumGraphqlClient from '../src/medium-graphql';
import { parseRawCookieHeader, serializeCookies } from '../src/medium-session';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('Medium session utilities', () => {
  it('parses a raw cookie header into named cookies', () => {
    const cookies = parseRawCookieHeader('sid=abc; uid=def; xsrf=ghi');

    expect(cookies).toEqual([
      expect.objectContaining({ name: 'sid', value: 'abc' }),
      expect.objectContaining({ name: 'uid', value: 'def' }),
      expect.objectContaining({ name: 'xsrf', value: 'ghi' })
    ]);
  });

  it('serializes imported cookies into a Cookie header', () => {
    const cookieHeader = serializeCookies([
      { name: 'sid', value: 'abc' },
      { name: 'uid', value: 'def' }
    ]);

    expect(cookieHeader).toBe('sid=abc; uid=def');
  });
});

describe('MediumGraphqlClient', () => {
  beforeEach(() => {
    process.env.MEDIUM_GRAPHQL_TRANSPORT = 'axios';
    process.env.MEDIUM_COOKIES_JSON = JSON.stringify([
      { name: 'sid', value: 'session-token', domain: '.medium.com' },
      { name: 'uid', value: 'user-token', domain: '.medium.com' },
      { name: 'xsrf', value: 'xsrf-token', domain: 'medium.com' }
    ]);
    delete process.env.MEDIUM_GRAPHQL_OPERATIONS_FILE;
    mockedAxios.get.mockReset();
    mockedAxios.post.mockReset();
  });

  it('probes a Medium session without redirecting to signin', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      status: 200,
      headers: {},
      data: '<html></html>'
    } as any);

    const client = new MediumGraphqlClient();
    const result = await client.probeSession();

    expect(result.authenticated).toBe(true);
    expect(mockedAxios.get).toHaveBeenCalledWith(
      'https://medium.com/me/stories/drafts',
      expect.objectContaining({
        headers: expect.objectContaining({
          Cookie: expect.stringContaining('sid=session-token'),
          'x-xsrf-token': 'xsrf-token'
        }),
        maxRedirects: 0
      })
    );
  });

  it('executes a raw GraphQL request with session cookies and xsrf header', async () => {
    mockedAxios.post.mockResolvedValueOnce({
      status: 200,
      headers: { 'content-type': 'application/json' },
      data: { data: { viewer: { id: 'viewer-1' } } }
    } as any);

    const client = new MediumGraphqlClient();
    const result = await client.execute({
      body: {
        operationName: 'Viewer',
        variables: { id: 'viewer-1' },
        query: 'query Viewer($id: ID!) { viewer(id: $id) { id } }'
      },
      source: 'unit-test-source'
    });

    expect(result.status).toBe(200);
    expect(result.requestSummary.operationName).toBe('Viewer');
    expect(result.requestSummary.graphqlOperationHeader).toBe('Viewer');
    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.stringContaining('https://medium.com/_/graphql?source=unit-test-source'),
      expect.objectContaining({
        operationName: 'Viewer'
      }),
      expect.objectContaining({
        headers: expect.objectContaining({
          Cookie: expect.stringContaining('uid=user-token'),
          'Graphql-Operation': 'Viewer',
          'x-xsrf-token': 'xsrf-token'
        })
      })
    );
  });

  it('executes a registered operation from a registry file', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'medium-graphql-'));
    const registryPath = path.join(tempDir, 'medium-operations.json');
    fs.writeFileSync(
      registryPath,
      JSON.stringify({
        operations: {
          getViewer: {
            endpoint: 'https://medium.com/_/graphql',
            source: 'registry-source',
            body: {
              operationName: 'Viewer',
              query: 'query Viewer { viewer { id } }',
              variables: {}
            }
          }
        }
      }),
      'utf-8'
    );

    process.env.MEDIUM_GRAPHQL_OPERATIONS_FILE = registryPath;
    mockedAxios.post.mockResolvedValueOnce({
      status: 200,
      headers: {},
      data: { data: { viewer: { id: 'viewer-1' } } }
    } as any);

    const client = new MediumGraphqlClient();
    const result = await client.executeRegisteredOperation('getViewer', {
      body: {
        variables: { scope: 'full' }
      }
    });

    expect(result.status).toBe(200);
    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.stringContaining('source=registry-source'),
      expect.objectContaining({
        variables: { scope: 'full' }
      }),
      expect.any(Object)
    );
  });
});
