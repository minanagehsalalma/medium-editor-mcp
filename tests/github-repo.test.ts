import axios from 'axios';
import GitHubRepoClient from '../src/github-repo';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('GitHubRepoClient', () => {
  beforeEach(() => {
    mockedAxios.get.mockReset();
  });

  function mockWifiRepoResponses() {
    mockedAxios.get.mockImplementation(async (url: string, config?: any) => {
      if (url === 'https://api.github.com/repos/minanagehsalalma/WIFI-Location-Locator-GUI') {
        return {
          data: {
            name: 'WIFI-Location-Locator-GUI',
            full_name: 'minanagehsalalma/WIFI-Location-Locator-GUI',
            html_url: 'https://github.com/minanagehsalalma/WIFI-Location-Locator-GUI',
            description: 'Locate Wi-Fi networks from a BSSID and render the result on a map.',
            private: false,
            created_at: '2026-05-01T00:00:00Z',
            updated_at: '2026-05-02T00:00:00Z',
            pushed_at: '2026-05-03T00:00:00Z',
            default_branch: 'main',
            owner: { login: 'minanagehsalalma' },
            language: 'Python',
            topics: ['python', 'gui', 'wifi']
          }
        } as any;
      }

      if (url === 'https://api.github.com/repos/minanagehsalalma/WIFI-Location-Locator-GUI/readme') {
        return {
          data: [
            '# Wi-Fi Locator GUI',
            '',
            'This project provides a sleek Tkinter GUI that queries Apple\'s Wi-Fi geolocation service for a given BSSID.',
            '',
            '![Main window](https://github.com/user-attachments/assets/wifi-gui.png)',
            '',
            '```bash',
            'pip install -r requirements.txt',
            '```',
            '',
            '```bash',
            'python apple_wifi_locator_gui.py',
            '```'
          ].join('\n')
        } as any;
      }

      if (url === 'https://api.github.com/repos/minanagehsalalma/WIFI-Location-Locator-GUI/git/trees/main?recursive=1') {
        return {
          data: {
            truncated: false,
            tree: [
              { path: 'README.md', type: 'blob', size: 500 },
              { path: 'apple_wifi_locator_gui.py', type: 'blob', size: 19000 },
              { path: 'requirements.txt', type: 'blob', size: 51 },
              { path: 'helpers/BSSIDApple.proto', type: 'blob', size: 262 }
            ]
          }
        } as any;
      }

      if (url === 'https://raw.githubusercontent.com/minanagehsalalma/WIFI-Location-Locator-GUI/main/apple_wifi_locator_gui.py') {
        return {
          data: [
            'import requests',
            '',
            'def lookup_location(mac):',
            '    return mac',
            '',
            'def create_modern_gui():',
            '    pass'
          ].join('\n')
        } as any;
      }

      if (url === 'https://raw.githubusercontent.com/minanagehsalalma/WIFI-Location-Locator-GUI/main/README.md') {
        return {
          data: '# Wi-Fi Locator GUI\n\nReadme body.'
        } as any;
      }

      if (url === 'https://raw.githubusercontent.com/minanagehsalalma/WIFI-Location-Locator-GUI/main/requirements.txt') {
        return {
          data: 'requests\nprotobuf>=3.20,<4\ntkinterweb\npythonmonkey\n'
        } as any;
      }

      if (url === 'https://raw.githubusercontent.com/minanagehsalalma/WIFI-Location-Locator-GUI/main/helpers/BSSIDApple.proto') {
        return {
          data: 'syntax = "proto2";'
        } as any;
      }

      throw new Error(`Unexpected URL in test: ${url} ${JSON.stringify(config || {})}`);
    });
  }

  it('imports a GitHub repository from a URL and normalizes key files', async () => {
    mockWifiRepoResponses();

    const client = new GitHubRepoClient();
    const repo = await client.importRepository('https://github.com/minanagehsalalma/WIFI-Location-Locator-GUI');

    expect(repo.fullName).toBe('minanagehsalalma/WIFI-Location-Locator-GUI');
    expect(repo.primaryFile?.path).toBe('apple_wifi_locator_gui.py');
    expect(repo.suggestedTitle).toContain('Wi-Fi Locator GUI');
    expect(repo.writerBrief).toContain('Use https://github.com/minanagehsalalma/WIFI-Location-Locator-GUI as the canonical source');
    expect(repo.images).toEqual([
      {
        alt: 'Main window',
        sourceFile: 'README.md',
        url: 'https://github.com/user-attachments/assets/wifi-gui.png'
      }
    ]);
  });

  it('prepares a Medium-ready draft from a GitHub repository', async () => {
    mockWifiRepoResponses();

    const client = new GitHubRepoClient();
    const draft = await client.prepareMediumDraft('minanagehsalalma/WIFI-Location-Locator-GUI', {
      angle: 'show how the repo turns a raw BSSID into a visible map result',
      audience: 'Python developers who want a working desktop tool'
    });

    expect(draft.mediumTitle).toContain('Wi-Fi Locator GUI');
    expect(draft.mediumMarkdown).toContain('## What the repo does');
    expect(draft.mediumMarkdown).toContain('## What it looks like');
    expect(draft.mediumMarkdown).toContain('https://github.com/user-attachments/assets/wifi-gui.png');
    expect(draft.mediumMarkdown).toContain('## Run it');
    expect(draft.mediumMarkdown).toContain('pip install -r requirements.txt');
    expect(draft.mediumBodyMarkdown).not.toContain('> Subtitle:');
    expect(draft.mediumSeoTitle).toContain('Wi-Fi Locator GUI');
    expect(draft.mediumTags.length).toBeGreaterThan(0);
    expect(draft.mediumAudit.score).toBeGreaterThanOrEqual(70);
  });
});
