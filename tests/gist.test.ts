import axios from 'axios';
import GistClient from '../src/gist';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('GistClient', () => {
  beforeEach(() => {
    mockedAxios.mockReset();
  });

  it('imports a gist from a URL and normalizes its source files', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        id: 'abc123',
        html_url: 'https://gist.github.com/example/abc123',
        description: 'Practical TypeScript retry helper',
        public: true,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-02T00:00:00Z',
        owner: { login: 'example' },
        files: {
          'retry.ts': {
            filename: 'retry.ts',
            language: 'TypeScript',
            type: 'application/typescript',
            raw_url: 'https://gist.githubusercontent.com/raw/retry.ts',
            size: 42,
            truncated: false,
            content: 'export const retry = () => true;'
          }
        }
      }
    } as any);

    const client = new GistClient();
    const gist = await client.importGist('https://gist.github.com/example/abc123');

    expect(gist.id).toBe('abc123');
    expect(gist.primaryFile?.filename).toBe('retry.ts');
    expect(gist.suggestedTitle).toBe('Practical TypeScript retry helper');
    expect(gist.suggestedTags).toEqual(['TypeScript', 'Software Engineering', 'Programming']);
    expect(gist.writerBrief).toContain('Use https://gist.github.com/example/abc123 as the canonical source');
    expect(gist.writerBrief).toContain('Target subtitle/dek:');
  });

  it('fetches raw content when the API marks a file as truncated', async () => {
    mockedAxios.get
      .mockResolvedValueOnce({
        data: {
          id: 'abc123',
          html_url: 'https://gist.github.com/example/abc123',
          description: null,
          public: true,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-02T00:00:00Z',
          owner: { login: 'example' },
          files: {
            'README.md': {
              filename: 'README.md',
              language: 'Markdown',
              type: 'text/markdown',
              raw_url: 'https://gist.githubusercontent.com/raw/readme.md',
              size: 2000,
              truncated: true
            }
          }
        }
      } as any)
      .mockResolvedValueOnce({
        data: '# Imported title\n\nBody from raw URL'
      } as any);

    const client = new GistClient();
    const gist = await client.importGist('abc123');

    expect(gist.primaryFile?.content).toContain('Body from raw URL');
    expect(mockedAxios.get).toHaveBeenCalledWith(
      'https://gist.githubusercontent.com/raw/readme.md',
      expect.objectContaining({
        headers: expect.any(Object),
        responseType: 'text'
      })
    );
  });

  it('prepares a Medium-ready draft template', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        id: 'abc123',
        html_url: 'https://gist.github.com/example/abc123',
        description: 'Typed retry helper',
        public: true,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-02T00:00:00Z',
        owner: { login: 'example' },
        files: {
          'retry.ts': {
            filename: 'retry.ts',
            language: 'TypeScript',
            type: 'application/typescript',
            raw_url: 'https://gist.githubusercontent.com/raw/retry.ts',
            size: 42,
            truncated: false,
            content: 'export const retry = () => true;'
          }
        }
      }
    } as any);

    const client = new GistClient();
    const draft = await client.prepareMediumDraft('abc123', {
      angle: 'how to package small utilities into reusable building blocks',
      audience: 'intermediate TypeScript developers'
    });

    expect(draft.mediumTitle).toContain('Typed retry helper');
    expect(draft.mediumMarkdown).toContain('# Typed retry helper');
    expect(draft.mediumMarkdown).toContain('> Subtitle:');
    expect(draft.mediumMarkdown).toContain('Canonical source: https://gist.github.com/example/abc123');
    expect(draft.mediumMarkdown).toContain('## The problem');
    expect(draft.mediumMarkdown).toContain('## The fix');
    expect(draft.mediumBodyMarkdown).not.toContain('> Subtitle:');
    expect(draft.mediumBodyMarkdown).not.toContain('> Canonical source:');
    expect(draft.mediumBodyMarkdown).not.toContain('> Reader promise:');
    expect(draft.mediumMarkdown).toContain('```typescript');
    expect(draft.mediumSubtitle.length).toBeGreaterThan(20);
    expect(draft.mediumSeoTitle).toContain('Typed retry helper');
    expect(draft.mediumTags).toEqual(expect.arrayContaining(['TypeScript', 'Software Engineering', 'Programming']));
    expect(draft.mediumAudit.score).toBeGreaterThanOrEqual(70);
    expect(draft.mediumAudit.normalizedTags).toEqual(expect.arrayContaining(['TypeScript', 'Software Engineering', 'Programming']));
    expect(draft.mediumOptimization.auditAfter.score).toBeGreaterThanOrEqual(draft.mediumOptimization.auditBefore.score);
    expect(draft.mediumArticleOptimization.finalAudit.score).toBeGreaterThanOrEqual(draft.mediumOptimization.auditAfter.score);
    expect(draft.draftStrategy.editorialChecklist).toHaveLength(4);
    expect(draft.draftStrategy.distributionChecklist).toHaveLength(4);
  });

  it('extracts gist images and carries them into the generated markdown', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        id: 'abc124',
        html_url: 'https://gist.github.com/example/abc124',
        description: 'VMware fix with screenshots',
        public: true,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-02T00:00:00Z',
        owner: { login: 'example' },
        files: {
          'README.md': {
            filename: 'README.md',
            language: 'Markdown',
            type: 'text/markdown',
            raw_url: 'https://gist.githubusercontent.com/raw/readme.md',
            size: 420,
            truncated: false,
            content: [
              '# Fix',
              '',
              '![Root causes](https://gist.github.com/user-attachments/assets/root-causes.png)',
              '',
              '<img src="https://gist.github.com/user-attachments/assets/final-state.png" alt="Final state" />'
            ].join('\n')
          }
        }
      }
    } as any);

    const client = new GistClient();
    const draft = await client.prepareMediumDraft('abc124');

    expect(draft.images).toEqual([
      {
        alt: 'Root causes',
        sourceFile: 'README.md',
        url: 'https://gist.github.com/user-attachments/assets/root-causes.png'
      },
      {
        alt: 'Final state',
        sourceFile: 'README.md',
        url: 'https://gist.github.com/user-attachments/assets/final-state.png'
      }
    ]);
    expect(draft.mediumMarkdown).toContain('## What it looks like');
    expect(draft.mediumMarkdown).toContain('![Root causes](https://gist.github.com/user-attachments/assets/root-causes.png)');
    expect(draft.mediumBodyMarkdown).toContain('![Final state](https://gist.github.com/user-attachments/assets/final-state.png)');
  });
});
