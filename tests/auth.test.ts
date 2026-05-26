import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import MediumAuth from '../src/auth';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('MediumAuth', () => {
  const tokenFilePath = path.join(process.cwd(), '.medium-tokens.json');

  beforeEach(() => {
    delete process.env.MEDIUM_CLIENT_ID;
    delete process.env.MEDIUM_CLIENT_SECRET;
    delete process.env.MEDIUM_AUTH_CODE;
    process.env.MEDIUM_ACCESS_TOKEN = 'test_access_token';
    mockedAxios.mockReset();

    if (fs.existsSync(tokenFilePath)) {
      fs.unlinkSync(tokenFilePath);
    }
  });

  afterEach(() => {
    if (fs.existsSync(tokenFilePath)) {
      fs.unlinkSync(tokenFilePath);
    }
  });

  it('authenticates with a direct access token without OAuth credentials', async () => {
    const auth = new MediumAuth();

    await expect(auth.authenticate()).resolves.toBeUndefined();
    expect(auth.getAccessToken()).toBe('test_access_token');
    expect(auth.isAuthenticated()).toBe(true);
  });

  it('persists direct access tokens to disk', async () => {
    const auth = new MediumAuth();

    await auth.authenticate();

    expect(fs.existsSync(tokenFilePath)).toBe(true);
    const tokenData = JSON.parse(fs.readFileSync(tokenFilePath, 'utf-8'));
    expect(tokenData.access_token).toBe('test_access_token');
    expect(tokenData.token_type).toBe('Bearer');
  });

  it('requires authentication before exposing the token', () => {
    const auth = new MediumAuth();

    expect(() => auth.getAccessToken()).toThrow('Authentication required');
  });

  it('clears stored tokens', async () => {
    const auth = new MediumAuth();
    await auth.authenticate();

    auth.clearTokens();

    expect(fs.existsSync(tokenFilePath)).toBe(false);
    expect(auth.isAuthenticated()).toBe(false);
  });

  it('requires OAuth credentials only when the OAuth flow is used', async () => {
    delete process.env.MEDIUM_ACCESS_TOKEN;
    process.env.MEDIUM_AUTH_CODE = 'auth-code';

    const auth = new MediumAuth();

    await expect(auth.authenticate()).rejects.toThrow('MEDIUM_CLIENT_ID and MEDIUM_CLIENT_SECRET');
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });
});
