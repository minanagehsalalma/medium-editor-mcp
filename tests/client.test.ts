import axios from 'axios';
import MediumAuth from '../src/auth';
import MediumClient from '../src/client';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('MediumClient', () => {
  let client: MediumClient;

  beforeEach(async () => {
    process.env.MEDIUM_ACCESS_TOKEN = 'test_access_token';
    const auth = new MediumAuth();
    await auth.authenticate();
    client = new MediumClient(auth);
    mockedAxios.mockReset();
  });

  it('publishes an article with Medium-supported fields', async () => {
    mockedAxios
      .mockResolvedValueOnce({
        data: { data: { id: 'user123' } },
        headers: {},
        status: 200
      } as any)
      .mockResolvedValueOnce({
        data: { data: { id: 'post123', title: 'Test Article' } },
        headers: {},
        status: 201
      } as any);

    const result = await client.publishArticle({
      title: 'Test Article',
      content: '# Test Article\n\nBody',
      contentFormat: 'markdown',
      canonicalUrl: 'https://gist.github.com/example/123',
      license: 'cc-40-by',
      tags: ['typescript', 'typescript', 'medium', 'mcp', 'extra']
    });

    expect(result.data.id).toBe('post123');
    expect(mockedAxios).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        method: 'post',
        url: expect.stringContaining('/users/user123/posts'),
        data: expect.objectContaining({
          canonicalUrl: 'https://gist.github.com/example/123',
          license: 'cc-40-by',
          tags: ['typescript', 'medium', 'mcp']
        })
      })
    );
  });

  it('retrieves the user profile', async () => {
    mockedAxios.mockResolvedValueOnce({
      data: {
        data: {
          id: 'user123',
          username: 'testuser',
          name: 'Test User'
        }
      },
      headers: {},
      status: 200
    } as any);

    const result = await client.getUserProfile();

    expect(result.data.username).toBe('testuser');
    expect(mockedAxios).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'get',
        url: expect.stringContaining('/me')
      })
    );
  });

  it('retrieves publication contributors', async () => {
    mockedAxios.mockResolvedValueOnce({
      data: {
        data: [
          { publicationId: 'pub123', userId: 'user123', role: 'editor' }
        ]
      },
      headers: {},
      status: 200
    } as any);

    const result = await client.getPublicationContributors('pub123');

    expect(result.data[0].role).toBe('editor');
    expect(mockedAxios).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'get',
        url: expect.stringContaining('/publications/pub123/contributors')
      })
    );
  });

  it('retries on rate limit responses', async () => {
    mockedAxios
      .mockRejectedValueOnce({
        response: {
          status: 429,
          statusText: 'Too Many Requests',
          data: { message: 'Rate limit exceeded' }
        }
      })
      .mockResolvedValueOnce({
        data: { data: { id: 'user123' } },
        headers: {},
        status: 200
      } as any);

    const result = await client.getUserProfile();

    expect(result.data.id).toBe('user123');
    expect(mockedAxios).toHaveBeenCalledTimes(2);
  });

  it('tracks rate limit headers', async () => {
    mockedAxios.mockResolvedValueOnce({
      data: { data: { id: 'user123' } },
      headers: {
        'x-ratelimit-remaining': '99',
        'x-ratelimit-reset': '1899999999'
      },
      status: 200
    } as any);

    await client.getUserProfile();
    const rateLimitInfo = client.getRateLimitInfo();

    expect(rateLimitInfo.remaining).toBe(99);
    expect(rateLimitInfo.resetAt).toBeInstanceOf(Date);
  });
});
