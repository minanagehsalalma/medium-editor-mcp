import axios from 'axios';
import MediumLegacyEditorClient, {
  parseMediumResponseBody,
  stripMediumJsonPrefix
} from '../src/medium-legacy-editor';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('Medium legacy response helpers', () => {
  it('strips Medium JSON prefix markers', () => {
    expect(stripMediumJsonPrefix('])}while(1);</x>{"ok":true}')).toBe('{"ok":true}');
    expect(stripMediumJsonPrefix('  ])}while(1);{"ok":true}')).toBe('{"ok":true}');
  });

  it('parses prefixed JSON bodies', () => {
    const parsed = parseMediumResponseBody('])}while(1);</x>{"payload":{"id":"draft-1"}}');

    expect(parsed.data).toEqual({
      payload: {
        id: 'draft-1'
      }
    });
    expect(parsed.rawData).toContain('draft-1');
  });
});

describe('MediumLegacyEditorClient', () => {
  beforeEach(() => {
    process.env.MEDIUM_GRAPHQL_TRANSPORT = 'axios';
    process.env.MEDIUM_COOKIES_JSON = JSON.stringify([
      { name: 'sid', value: 'session-token', domain: '.medium.com' },
      { name: 'uid', value: 'user-token', domain: '.medium.com' },
      { name: 'xsrf', value: 'xsrf-token', domain: 'medium.com' }
    ]);
    mockedAxios.request.mockReset();
  });

  it('creates a legacy draft through /new-story', async () => {
    mockedAxios.request.mockResolvedValueOnce({
      status: 200,
      headers: { 'content-type': 'application/json' },
      data: '])}while(1);</x>{"payload":{"id":"draft-1"}}'
    } as any);

    const client = new MediumLegacyEditorClient();
    const result = await client.createDraft();

    expect(result.status).toBe(200);
    expect(result.data).toEqual({
      payload: {
        id: 'draft-1'
      }
    });
    expect(mockedAxios.request).toHaveBeenCalledWith(expect.objectContaining({
      method: 'POST',
      url: 'https://medium.com/new-story',
      data: {},
      headers: expect.objectContaining({
        Cookie: expect.stringContaining('sid=session-token'),
        'X-Requested-With': 'XMLHttpRequest',
        'x-xsrf-token': 'xsrf-token'
      })
    }));
  });

  it('fetches post deltas for a specific base revision', async () => {
    mockedAxios.request.mockResolvedValueOnce({
      status: 200,
      headers: {},
      data: '])}while(1);</x>{"payload":{"postDeltas":[]}}'
    } as any);

    const client = new MediumLegacyEditorClient();
    const result = await client.getDeltas('post-123', 504);

    expect(result.data).toEqual({
      payload: {
        postDeltas: []
      }
    });
    expect(mockedAxios.request).toHaveBeenCalledWith(expect.objectContaining({
      method: 'GET',
      url: 'https://medium.com/p/post-123/deltas?baseRev=504'
    }));
  });

  it('replays a delta body with baseRev and deltas keys', async () => {
    mockedAxios.request.mockResolvedValueOnce({
      status: 400,
      headers: {},
      data: 'Malformed deltas'
    } as any);

    const client = new MediumLegacyEditorClient();
    await client.applyDeltas('post-123', -1, [{ type: 'noop' }], {
      ignored: true
    });

    expect(mockedAxios.request).toHaveBeenCalledWith(expect.objectContaining({
      method: 'POST',
      url: 'https://medium.com/p/post-123/deltas',
      data: {
        ignored: true,
        baseRev: -1,
        deltas: [{ type: 'noop' }]
      }
    }));
  });
});
