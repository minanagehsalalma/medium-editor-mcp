import axios, { AxiosError } from 'axios';
import MediumAuth from './auth';

type HttpMethod = 'get' | 'post' | 'put' | 'delete';
type ContentFormat = 'markdown' | 'html';
type PublishStatus = 'public' | 'draft' | 'unlisted';
type MediumLicense =
  | 'all-rights-reserved'
  | 'cc-40-by'
  | 'cc-40-by-sa'
  | 'cc-40-by-nd'
  | 'cc-40-by-nc'
  | 'cc-40-by-nc-nd'
  | 'cc-40-by-nc-sa'
  | 'cc-40-zero'
  | 'public-domain';

interface PublishArticleParams {
  title: string;
  content: string;
  contentFormat?: ContentFormat;
  tags?: string[];
  publicationId?: string;
  publishStatus?: PublishStatus;
  notifyFollowers?: boolean;
  canonicalUrl?: string;
  license?: MediumLicense;
}

interface UpdateArticleParams {
  articleId: string;
  title?: string;
  content?: string;
  tags?: string[];
  publishStatus?: PublishStatus;
}

interface SearchArticlesParams {
  keywords?: string[];
  publicationId?: string;
  tags?: string[];
}

interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
}

class MediumClient {
  private auth: MediumAuth;
  private baseUrl = 'https://api.medium.com/v1';
  private retryConfig: RetryConfig = {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 10000
  };
  private rateLimitRemaining: number | null = null;
  private rateLimitReset: number | null = null;

  constructor(auth: MediumAuth) {
    this.auth = auth;
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private calculateBackoffDelay(attempt: number): number {
    const delay = this.retryConfig.baseDelay * Math.pow(2, attempt);
    return Math.min(delay, this.retryConfig.maxDelay);
  }

  private isRetryableError(error: AxiosError): boolean {
    if (!error.response) {
      return true;
    }

    const status = error.response.status;
    return status === 429 || status === 502 || status === 503 || status === 504;
  }

  private updateRateLimitInfo(headers: Record<string, unknown>): void {
    const remaining = headers['x-ratelimit-remaining'];
    const reset = headers['x-ratelimit-reset'];

    if (typeof remaining === 'string') {
      const parsedRemaining = Number.parseInt(remaining, 10);
      this.rateLimitRemaining = Number.isNaN(parsedRemaining) ? null : parsedRemaining;
    }

    if (typeof reset === 'string') {
      const parsedReset = Number.parseInt(reset, 10);
      this.rateLimitReset = Number.isNaN(parsedReset) ? null : parsedReset * 1000;
    }
  }

  private async checkRateLimit(): Promise<void> {
    if (this.rateLimitRemaining !== 0 || !this.rateLimitReset) {
      return;
    }

    const waitTime = this.rateLimitReset - Date.now();
    if (waitTime > 0) {
      await this.sleep(waitTime);
    }
  }

  private createDetailedError(response: { status: number; statusText?: string; data?: any }): Error {
    const status = response.status;
    const data = response.data;

    let message = `Medium API error (${status})`;

    if (data?.errors) {
      message += `: ${JSON.stringify(data.errors)}`;
    } else if (data?.message) {
      message += `: ${data.message}`;
    } else if (response.statusText) {
      message += `: ${response.statusText}`;
    }

    const error: any = new Error(message);
    error.status = status;
    error.data = data;

    return error;
  }

  private async makeRequest(
    method: HttpMethod,
    endpoint: string,
    data?: unknown,
    retryAttempt: number = 0
  ): Promise<any> {
    try {
      await this.checkRateLimit();

      const response = await axios({
        method,
        url: `${this.baseUrl}${endpoint}`,
        headers: {
          'Authorization': `Bearer ${this.auth.getAccessToken()}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        data,
        validateStatus: () => true
      });

      this.updateRateLimitInfo(response.headers as Record<string, unknown>);

      if (response.status >= 400) {
        throw this.createDetailedError(response);
      }

      return response.data;
    } catch (error: any) {
      const axiosError = error as AxiosError;

      if (this.isRetryableError(axiosError) && retryAttempt < this.retryConfig.maxRetries) {
        const delay = this.calculateBackoffDelay(retryAttempt);
        await this.sleep(delay);
        return this.makeRequest(method, endpoint, data, retryAttempt + 1);
      }

      throw error;
    }
  }

  private normalizeTags(tags?: string[]): string[] | undefined {
    if (!tags?.length) {
      return undefined;
    }

    const normalized = tags
      .map((tag) => tag.trim())
      .filter(Boolean)
      .filter((tag, index, all) => all.findIndex((candidate) => candidate.toLowerCase() === tag.toLowerCase()) === index)
      .map((tag) => tag.slice(0, 25))
      .slice(0, 3);

    return normalized.length ? normalized : undefined;
  }

  async publishArticle(params: PublishArticleParams) {
    const user = await this.getUserProfile();
    const userId = user.data?.id;

    if (!userId) {
      throw new Error('Failed to retrieve authenticated Medium user ID.');
    }

    const payload: Record<string, unknown> = {
      title: params.title,
      contentFormat: params.contentFormat || 'markdown',
      content: params.content,
      publishStatus: params.publishStatus || 'draft'
    };

    const tags = this.normalizeTags(params.tags);
    if (tags) {
      payload.tags = tags;
    }

    if (params.notifyFollowers !== undefined) {
      payload.notifyFollowers = params.notifyFollowers;
    }

    if (params.canonicalUrl) {
      payload.canonicalUrl = params.canonicalUrl;
    }

    if (params.license) {
      payload.license = params.license;
    }

    const endpoint = params.publicationId
      ? `/publications/${params.publicationId}/posts`
      : `/users/${userId}/posts`;

    return this.makeRequest('post', endpoint, payload);
  }

  async updateArticle(params: UpdateArticleParams) {
    const payload: Record<string, unknown> = {};

    if (params.title) {
      payload.title = params.title;
    }

    if (params.content) {
      payload.content = params.content;
      payload.contentFormat = 'markdown';
    }

    const tags = this.normalizeTags(params.tags);
    if (tags) {
      payload.tags = tags;
    }

    if (params.publishStatus) {
      payload.publishStatus = params.publishStatus;
    }

    return this.makeRequest('put', `/posts/${params.articleId}`, payload);
  }

  async deleteArticle(articleId: string) {
    return this.makeRequest('delete', `/posts/${articleId}`);
  }

  async getArticle(articleId: string) {
    return this.makeRequest('get', `/posts/${articleId}`);
  }

  async getUserPublications() {
    const user = await this.getUserProfile();
    const userId = user.data?.id;

    if (!userId) {
      throw new Error('Failed to retrieve authenticated Medium user ID.');
    }

    return this.makeRequest('get', `/users/${userId}/publications`);
  }

  async getPublicationContributors(publicationId: string) {
    return this.makeRequest('get', `/publications/${publicationId}/contributors`);
  }

  async searchArticles(params: SearchArticlesParams) {
    const queryParams = new URLSearchParams();

    params.keywords?.forEach((keyword) => queryParams.append('q', keyword));
    if (params.publicationId) {
      queryParams.append('publicationId', params.publicationId);
    }
    params.tags?.forEach((tag) => queryParams.append('tag', tag));

    const query = queryParams.toString();
    const endpoint = query ? `/articles?${query}` : '/articles';

    return this.makeRequest('get', endpoint);
  }

  async getDrafts() {
    const user = await this.getUserProfile();
    const userId = user.data?.id;

    if (!userId) {
      throw new Error('Failed to retrieve authenticated Medium user ID.');
    }

    return this.makeRequest('get', `/users/${userId}/posts?status=draft`);
  }

  async getUserProfile() {
    return this.makeRequest('get', '/me');
  }

  getRateLimitInfo() {
    return {
      remaining: this.rateLimitRemaining,
      resetAt: this.rateLimitReset ? new Date(this.rateLimitReset) : null
    };
  }
}

export default MediumClient;
