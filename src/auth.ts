import { config } from 'dotenv';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

config();

interface TokenData {
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
  token_type: string;
}

class MediumAuth {
  private clientId: string | null;
  private clientSecret: string | null;
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private tokenExpiresAt: number | null = null;
  private tokenFilePath: string;

  constructor(tokenFilePath: string = path.join(process.cwd(), '.medium-tokens.json')) {
    this.clientId = process.env.MEDIUM_CLIENT_ID?.trim() || null;
    this.clientSecret = process.env.MEDIUM_CLIENT_SECRET?.trim() || null;
    this.tokenFilePath = tokenFilePath;
    this.loadStoredTokens();
  }

  private loadStoredTokens(): void {
    try {
      if (!fs.existsSync(this.tokenFilePath)) {
        return;
      }

      const data = fs.readFileSync(this.tokenFilePath, 'utf-8');
      const tokenData: TokenData = JSON.parse(data);

      this.accessToken = tokenData.access_token;
      this.refreshToken = tokenData.refresh_token || null;
      this.tokenExpiresAt = tokenData.expires_at || null;
    } catch (error) {
      console.warn('Failed to load stored Medium tokens:', error);
    }
  }

  private saveTokens(tokenData: TokenData): void {
    fs.writeFileSync(this.tokenFilePath, JSON.stringify(tokenData, null, 2), 'utf-8');
  }

  private clearInMemoryTokens(): void {
    this.accessToken = null;
    this.refreshToken = null;
    this.tokenExpiresAt = null;
  }

  private requireOAuthCredentials(): { clientId: string; clientSecret: string } {
    if (!this.clientId || !this.clientSecret) {
      throw new Error(
        'MEDIUM_CLIENT_ID and MEDIUM_CLIENT_SECRET are required only for legacy OAuth flows. ' +
        'Prefer MEDIUM_ACCESS_TOKEN for current Medium integrations.'
      );
    }

    return {
      clientId: this.clientId,
      clientSecret: this.clientSecret
    };
  }

  private isTokenValid(): boolean {
    if (!this.accessToken) {
      return false;
    }

    if (!this.tokenExpiresAt) {
      return true;
    }

    const now = Date.now();
    const bufferTime = 5 * 60 * 1000;
    return this.tokenExpiresAt > now + bufferTime;
  }

  public async authenticate(): Promise<void> {
    if (this.isTokenValid()) {
      return;
    }

    if (this.refreshToken) {
      try {
        await this.refreshAccessToken();
        return;
      } catch (error) {
        console.warn('Stored Medium refresh token could not be refreshed, falling back to configured auth method.', error);
        this.clearTokens();
      }
    }

    this.accessToken = await this.requestAccessToken();
  }

  private async requestAccessToken(): Promise<string> {
    const directToken = process.env.MEDIUM_ACCESS_TOKEN?.trim();
    if (directToken) {
      this.saveTokens({
        access_token: directToken,
        token_type: 'Bearer'
      });
      return directToken;
    }

    const authCode = process.env.MEDIUM_AUTH_CODE?.trim();
    if (authCode) {
      return this.exchangeCodeForToken(authCode);
    }

    throw new Error(
      'No Medium authentication method configured. Set MEDIUM_ACCESS_TOKEN ' +
      '(recommended) or configure the legacy OAuth variables for an existing integration.'
    );
  }

  private async exchangeCodeForToken(authCode: string): Promise<string> {
    const { clientId, clientSecret } = this.requireOAuthCredentials();
    const body = new URLSearchParams({
      code: authCode,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'authorization_code',
      redirect_uri: process.env.MEDIUM_REDIRECT_URI || 'http://localhost:3000/callback'
    });

    try {
      const response = await axios.post('https://api.medium.com/v1/tokens', body.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
          'Accept-Charset': 'utf-8'
        }
      });

      const tokenData: TokenData = {
        access_token: response.data.access_token,
        refresh_token: response.data.refresh_token,
        expires_at: Date.now() + (response.data.expires_in * 1000),
        token_type: response.data.token_type || 'Bearer'
      };

      this.accessToken = tokenData.access_token;
      this.refreshToken = tokenData.refresh_token || null;
      this.tokenExpiresAt = tokenData.expires_at || null;
      this.saveTokens(tokenData);

      return tokenData.access_token;
    } catch (error: any) {
      throw new Error(`Failed to exchange authorization code: ${error.message}`);
    }
  }

  private async refreshAccessToken(): Promise<void> {
    if (!this.refreshToken) {
      throw new Error('No refresh token available');
    }

    const { clientId, clientSecret } = this.requireOAuthCredentials();
    const body = new URLSearchParams({
      refresh_token: this.refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token'
    });

    const response = await axios.post('https://api.medium.com/v1/tokens', body.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
        'Accept-Charset': 'utf-8'
      }
    });

    const tokenData: TokenData = {
      access_token: response.data.access_token,
      refresh_token: response.data.refresh_token || this.refreshToken,
      expires_at: Date.now() + (response.data.expires_in * 1000),
      token_type: response.data.token_type || 'Bearer'
    };

    this.accessToken = tokenData.access_token;
    this.refreshToken = tokenData.refresh_token || null;
    this.tokenExpiresAt = tokenData.expires_at || null;
    this.saveTokens(tokenData);
  }

  public getAccessToken(): string {
    if (!this.accessToken) {
      throw new Error('Authentication required. Call authenticate() first.');
    }

    return this.accessToken;
  }

  public isAuthenticated(): boolean {
    return this.isTokenValid();
  }

  public clearTokens(): void {
    this.clearInMemoryTokens();

    if (fs.existsSync(this.tokenFilePath)) {
      fs.unlinkSync(this.tokenFilePath);
    }
  }
}

export default MediumAuth;
