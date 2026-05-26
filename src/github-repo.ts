import axios from 'axios';
import {
  buildMediumDraftStrategy,
  suggestMediumTags,
  type MediumDraftStrategy
} from './medium-content-strategy';
import { auditMediumDraft, type MediumDraftAuditResult } from './medium-draft-audit';
import {
  optimizeMediumDraftPackage,
  type MediumDraftPackageOptimizationResult
} from './medium-draft-optimizer';
import {
  optimizeMediumArticleDraft,
  type MediumArticleOptimizationResult
} from './medium-article-optimizer';

interface GitHubRepoOwner {
  login: string;
}

interface GitHubRepoResponse {
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  private: boolean;
  created_at: string;
  updated_at: string;
  pushed_at: string;
  default_branch: string;
  owner: GitHubRepoOwner;
  language: string | null;
  topics?: string[];
}

interface GitHubTreeEntry {
  path: string;
  type: 'blob' | 'tree';
  size?: number;
}

interface GitHubTreeResponse {
  tree: GitHubTreeEntry[];
  truncated: boolean;
}

interface FetchRepoOptions {
  includeFileContents?: boolean;
  maxFileChars?: number;
  maxFiles?: number;
}

interface PrepareRepoDraftOptions extends FetchRepoOptions {
  angle?: string;
  audience?: string;
  callToAction?: string;
}

export interface ImportedGitHubRepoFile {
  filename: string;
  path: string;
  type: string | null;
  language: string | null;
  rawUrl: string | null;
  size: number;
  truncated: boolean;
  content?: string;
}

export interface ImportedGitHubRepoImage {
  alt: string | null;
  sourceFile: string;
  url: string;
}

export interface ImportedGitHubRepo {
  canonicalUrl: string;
  createdAt: string;
  defaultBranch: string;
  description: string | null;
  files: ImportedGitHubRepoFile[];
  fullName: string;
  images: ImportedGitHubRepoImage[];
  isPrivate: boolean;
  name: string;
  ownerLogin: string;
  primaryFile: ImportedGitHubRepoFile | null;
  pushedAt: string;
  readmeContent: string | null;
  suggestedTags: string[];
  suggestedTitle: string;
  topics: string[];
  updatedAt: string;
  url: string;
  writerBrief: string;
}

export interface PreparedGitHubRepoDraft extends ImportedGitHubRepo {
  mediumArticleOptimization: MediumArticleOptimizationResult;
  draftStrategy: MediumDraftStrategy;
  mediumAudit: MediumDraftAuditResult;
  mediumBodyMarkdown: string;
  mediumMarkdown: string;
  mediumOptimization: MediumDraftPackageOptimizationResult;
  mediumSeoDescription: string;
  mediumSeoTitle: string;
  mediumSubtitle: string;
  mediumTags: string[];
  mediumTitle: string;
}

const languageByExtension = new Map<string, string>([
  ['.c', 'C'],
  ['.cc', 'C++'],
  ['.cpp', 'C++'],
  ['.cs', 'C#'],
  ['.css', 'CSS'],
  ['.go', 'Go'],
  ['.graphql', 'GraphQL'],
  ['.h', 'C'],
  ['.hpp', 'C++'],
  ['.html', 'HTML'],
  ['.java', 'Java'],
  ['.js', 'JavaScript'],
  ['.json', 'JSON'],
  ['.kt', 'Kotlin'],
  ['.md', 'Markdown'],
  ['.php', 'PHP'],
  ['.proto', 'Protocol Buffers'],
  ['.ps1', 'PowerShell'],
  ['.py', 'Python'],
  ['.rb', 'Ruby'],
  ['.rs', 'Rust'],
  ['.sh', 'Shell'],
  ['.sql', 'SQL'],
  ['.swift', 'Swift'],
  ['.ts', 'TypeScript'],
  ['.tsx', 'TSX'],
  ['.txt', 'Text'],
  ['.yaml', 'YAML'],
  ['.yml', 'YAML']
]);

class GitHubRepoClient {
  private baseUrl = 'https://api.github.com';
  private githubToken = process.env.GITHUB_TOKEN?.trim() || null;

  private buildHeaders() {
    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'medium-mcp-server',
      'X-GitHub-Api-Version': '2022-11-28'
    };

    if (this.githubToken) {
      headers.Authorization = `Bearer ${this.githubToken}`;
    }

    return headers;
  }

  private parseRepoReference(reference: string) {
    const trimmed = reference.trim();

    try {
      const url = new URL(trimmed);
      if (url.hostname !== 'github.com') {
        throw new Error('Only github.com repository URLs are supported.');
      }

      const segments = url.pathname.split('/').filter(Boolean);
      if (segments.length < 2) {
        throw new Error('Expected a GitHub repository URL with owner and repo name.');
      }

      return {
        owner: segments[0],
        repo: segments[1].replace(/\.git$/i, '')
      };
    } catch {
      const match = trimmed.match(/^([^/\s]+)\/([^/\s]+)$/);
      if (match) {
        return {
          owner: match[1],
          repo: match[2].replace(/\.git$/i, '')
        };
      }

      throw new Error('Expected a GitHub repository URL or owner/repo reference.');
    }
  }

  private buildRawFileUrl(owner: string, repo: string, branch: string, filePath: string) {
    const encodedSegments = filePath.split('/').map((segment) => encodeURIComponent(segment));
    return `https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(branch)}/${encodedSegments.join('/')}`;
  }

  private inferLanguageFromPath(filePath: string) {
    const normalized = filePath.toLowerCase();
    const extMatch = normalized.match(/(\.[^.\\/]+)$/);
    if (extMatch) {
      return languageByExtension.get(extMatch[1]) || null;
    }

    if (/dockerfile$/i.test(filePath)) {
      return 'Dockerfile';
    }

    return null;
  }

  private inferMimeType(filePath: string) {
    const normalized = filePath.toLowerCase();
    if (normalized.endsWith('.md')) {
      return 'text/markdown';
    }

    if (normalized.endsWith('.py')) {
      return 'text/x-python';
    }

    if (normalized.endsWith('.json')) {
      return 'application/json';
    }

    if (normalized.endsWith('.txt')) {
      return 'text/plain';
    }

    return null;
  }

  private isInterestingFile(filePath: string) {
    const normalized = filePath.toLowerCase();

    if (normalized.includes('/.git/') || normalized.startsWith('.git/')) {
      return false;
    }

    if (/(^|\/)(node_modules|dist|build|coverage|__pycache__|\.next|vendor)\//.test(normalized)) {
      return false;
    }

    if (/\.(png|jpg|jpeg|gif|webp|svg|ico|pdf|zip|exe|dll|so|dylib)$/i.test(normalized)) {
      return false;
    }

    return /\.(md|txt|py|js|ts|tsx|jsx|go|rs|java|kt|swift|ps1|sh|json|ya?ml|toml|ini|cfg|proto|sql)$/i.test(normalized)
      || /(^|\/)(readme|requirements|package\.json|tsconfig\.json|dockerfile)$/i.test(normalized);
  }

  private scoreFileForImport(filePath: string, size: number) {
    const normalized = filePath.toLowerCase();
    let score = size;

    if (/^readme/i.test(normalized) || normalized.endsWith('/readme.md')) {
      score += 5000;
    }

    if (/^(src\/)?(main|app|index|server|client|.*gui)\./i.test(normalized) || /gui/i.test(normalized)) {
      score += 4000;
    }

    if (/requirements\.txt$|package\.json$|dockerfile$|compose\.ya?ml$/i.test(normalized)) {
      score += 2000;
    }

    if (normalized.includes('/helpers/') || normalized.includes('/lib/')) {
      score += 1000;
    }

    if (normalized.split('/').length === 1) {
      score += 500;
    }

    return score;
  }

  private choosePrimaryFile(files: ImportedGitHubRepoFile[]) {
    if (!files.length) {
      return null;
    }

    const sourceCandidates = files.filter((file) => !/^readme/i.test(file.filename) && file.language !== 'Markdown');
    if (sourceCandidates.length) {
      return [...sourceCandidates].sort((left, right) => right.size - left.size)[0];
    }

    const readme = files.find((file) => /^readme/i.test(file.filename));
    return readme || files[0];
  }

  private extractReadmeTitle(content: string | null) {
    if (!content) {
      return null;
    }

    const match = content.match(/^#\s+(.+)$/m);
    return match?.[1]?.trim() || null;
  }

  private normalizeSentence(value: string) {
    const trimmed = value.replace(/\s+/g, ' ').trim();
    if (!trimmed) {
      return '';
    }

    return trimmed[0].toUpperCase() + trimmed.slice(1);
  }

  private extractTitleClauseFromSummary(summary: string | null) {
    if (!summary) {
      return null;
    }

    const firstSentence = summary.split(/(?<=[.?!])\s+/)[0] || summary;
    const cleaned = firstSentence.replace(/\s+/g, ' ').trim();
    const match = cleaned.match(/\bthat\s+(.+)$/i);
    const clause = (match?.[1] || cleaned)
      .replace(/^this project provides\s+/i, '')
      .replace(/^a\s+/i, '')
      .replace(/^an\s+/i, '')
      .replace(/[.]+$/, '')
      .trim();

    if (!clause) {
      return null;
    }

    return clause.charAt(0).toUpperCase() + clause.slice(1);
  }

  private buildSuggestedTitle(
    repo: GitHubRepoResponse,
    readmeTitle: string | null,
    readmeSummary: string | null,
    primaryFile: ImportedGitHubRepoFile | null
  ) {
    const clause = this.extractTitleClauseFromSummary(readmeSummary);
    if (readmeTitle && clause && !readmeTitle.toLowerCase().includes(clause.toLowerCase())) {
      const article = /^[aeiou]/i.test(readmeTitle) ? 'an' : 'a';
      return `I Built ${/^(a|an|the)\b/i.test(readmeTitle) ? readmeTitle : `${article} ${readmeTitle}`} That ${clause}`;
    }

    if (readmeTitle) {
      return readmeTitle;
    }

    const description = repo.description?.trim();
    if (description) {
      return this.normalizeSentence(description);
    }

    if (primaryFile) {
      return primaryFile.filename
        .replace(/\.[^.]+$/, '')
        .replace(/[-_]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/\b\w/g, (character) => character.toUpperCase());
    }

    return repo.name.replace(/[-_]+/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase());
  }

  private extractImagesFromMarkdown(
    content: string | null,
    owner: string,
    repo: string,
    branch: string,
    sourceFile: string
  ): ImportedGitHubRepoImage[] {
    if (!content) {
      return [];
    }

    const images: ImportedGitHubRepoImage[] = [];
    const seen = new Set<string>();
    const pushImage = (url: string, alt?: string | null) => {
      const normalizedUrl = url.trim();
      if (!normalizedUrl || seen.has(normalizedUrl)) {
        return;
      }

      seen.add(normalizedUrl);
      images.push({
        alt: alt?.trim() || null,
        sourceFile,
        url: normalizedUrl
      });
    };

    const resolveUrl = (candidate: string) => {
      if (/^https?:\/\//i.test(candidate)) {
        return candidate;
      }

      if (candidate.startsWith('/')) {
        return `https://github.com/${owner}/${repo}/blob/${branch}${candidate}`;
      }

      const parent = sourceFile.includes('/')
        ? sourceFile.slice(0, sourceFile.lastIndexOf('/') + 1)
        : '';
      return this.buildRawFileUrl(owner, repo, branch, `${parent}${candidate}`);
    };

    const markdownImagePattern = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/gi;
    const htmlImagePattern = /<img\b[^>]*?\bsrc=["']([^"']+)["'][^>]*>/gi;

    let markdownMatch: RegExpExecArray | null;
    while ((markdownMatch = markdownImagePattern.exec(content)) !== null) {
      pushImage(resolveUrl(markdownMatch[2]), markdownMatch[1]);
    }

    let htmlMatch: RegExpExecArray | null;
    while ((htmlMatch = htmlImagePattern.exec(content)) !== null) {
      const tag = htmlMatch[0];
      const altMatch = tag.match(/\balt=["']([^"']+)["']/i);
      pushImage(resolveUrl(htmlMatch[1]), altMatch?.[1] || null);
    }

    return images;
  }

  private extractReadmeSummary(readmeContent: string | null, description: string | null) {
    if (readmeContent) {
      const paragraphs = readmeContent
        .split(/\n\s*\n/)
        .map((block) => block.trim())
        .filter((block) => block.length > 0)
        .filter((block) => !block.startsWith('#'))
        .filter((block) => !/^!\[/.test(block) && !/^<img\b/i.test(block))
        .filter((block) => !/^\s*[-*]\s+/.test(block))
        .filter((block) => !/^\s*\d+\.\s+/.test(block))
        .filter((block) => !/^```/.test(block));

      if (paragraphs.length) {
        const first = paragraphs[0].replace(/\s+/g, ' ').trim();
        return /[.?!]$/.test(first) ? first : `${first}.`;
      }
    }

    if (description?.trim()) {
      const normalized = description.trim().replace(/\s+/g, ' ');
      return /[.?!]$/.test(normalized) ? normalized : `${normalized}.`;
    }

    return 'This repository solves one concrete problem and exposes the moving parts clearly enough to reuse.';
  }

  private truncateContent(content: string, maxFileChars: number): { content: string; truncated: boolean } {
    if (content.length <= maxFileChars) {
      return { content, truncated: false };
    }

    return {
      content: `${content.slice(0, maxFileChars)}\n\n[truncated after ${maxFileChars} characters]`,
      truncated: true
    };
  }

  private buildCodeExcerpt(file: ImportedGitHubRepoFile | null) {
    if (!file?.content) {
      return '_No file content was included in this import._';
    }

    const language = file.language?.toLowerCase() || '';
    const lines = file.content.split('\n');
    const excerpt = lines.slice(0, Math.min(80, lines.length)).join('\n');
    const excerptText = excerpt.length > 2400 ? excerpt.slice(0, 2400).trimEnd() : excerpt;
    const suffix = excerptText.length < file.content.length ? '\n# ...trimmed for the article\n' : '\n';
    return `\`\`\`${language}\n${excerptText}${suffix}\`\`\``;
  }

  private buildRunSection(readmeContent: string | null) {
    if (!readmeContent) {
      return [] as string[];
    }

    const codeFences = [...readmeContent.matchAll(/```([^\n]*)\n([\s\S]*?)```/g)];
    if (!codeFences.length) {
      return [] as string[];
    }

    const labels = ['Install', 'Run', 'Useful command'];
    const section: string[] = ['## Run it', ''];

    codeFences.slice(0, 3).forEach((match, index) => {
      const language = match[1].trim().toLowerCase() || 'bash';
      const body = match[2].trim();
      if (!body) {
        return;
      }

      section.push(`### ${labels[index] || `Step ${index + 1}`}`);
      section.push('');
      section.push(`\`\`\`${language}\n${body}\n\`\`\``);
      section.push('');
    });

    return section;
  }

  private buildWriterBrief(repo: Omit<ImportedGitHubRepo, 'writerBrief'>, strategy: MediumDraftStrategy) {
    const fileSummary = repo.files
      .map((file) => `${file.path}${file.language ? ` (${file.language})` : ''}`)
      .join(', ');
    const imageSummary = repo.images.length
      ? `Available repo images: ${repo.images.map((image) => image.sourceFile).join(', ')}.`
      : 'No inline repo images were detected.';

    return [
      `Use ${repo.url} as the canonical source for the article.`,
      `Target subtitle/dek: ${strategy.suggestedSubtitle}`,
      'Start with the practical result, not a definition.',
      repo.primaryFile
        ? `Center the walkthrough on ${repo.primaryFile.path} and use the rest of the repo only where it changes the outcome.`
        : 'Explain the repo structure before diving into file-level details.',
      `Opening direction: ${strategy.openingHook}`,
      `Cover image brief: ${strategy.coverImageBrief}`,
      `Recommended tag order: ${strategy.recommendedTagOrder.join(', ') || 'Developer Tools'}.`,
      `Available source files: ${fileSummary || 'none'}.`,
      imageSummary,
      'Keep the wording direct, actionable, and easy to skim.'
    ].join(' ');
  }

  private buildTopicTags(topics: string[]) {
    return topics
      .map((topic) => topic.trim())
      .filter(Boolean)
      .map((topic) => {
        const normalized = topic.toLowerCase();
        if (normalized === 'wifi') {
          return 'Wi-Fi';
        }

        if (normalized === 'network-tools') {
          return 'Networking';
        }

        if (normalized === 'mac-address') {
          return 'Mac Address';
        }

        return topic
          .split(/[-_]+/)
          .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
          .join(' ');
      });
  }

  private stripHtmlTags(value: string) {
    return value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  private buildSuggestedSubtitle(repo: ImportedGitHubRepo, summary: string, angle?: string) {
    const cleanSummary = this.stripHtmlTags(summary).replace(/[.]+$/, '');
    const firstSentence = cleanSummary.split(/(?<=[.?!])\s+/)[0] || cleanSummary;
    const fallback = repo.primaryFile
      ? `It centers the real work in ${repo.primaryFile.path}, keeps the request path visible, and gives you a desktop result you can reuse immediately.`
      : 'It keeps the working path clear, the request flow visible, and the setup small enough to reuse quickly.';

    if (angle?.trim()) {
      return `${firstSentence}. Focus: ${angle.trim()}.`;
    }

    return firstSentence ? `${firstSentence}.` : fallback;
  }

  private buildOpeningParagraph(summary: string, angle?: string) {
    const cleanSummary = this.stripHtmlTags(summary);
    if (angle?.trim()) {
      return `${cleanSummary} The walkthrough stays on ${angle.trim()}.`;
    }

    return cleanSummary;
  }

  private buildDraftMarkdown(repo: ImportedGitHubRepo, options: PrepareRepoDraftOptions) {
    const draftStrategy = buildMediumDraftStrategy({
      gist: {
        canonicalUrl: repo.canonicalUrl,
        description: repo.description,
        files: repo.files,
        images: repo.images,
        ownerLogin: repo.ownerLogin,
        primaryFile: repo.primaryFile,
        suggestedTitle: repo.suggestedTitle
      },
      angle: options.angle,
      audience: options.audience,
      suggestedTags: repo.suggestedTags
    });
    const fileList = repo.files
      .map((file) => `- \`${file.path}\`${file.language ? ` (${file.language})` : ''}`)
      .join('\n');
    const summary = this.extractReadmeSummary(repo.readmeContent, repo.description);
    const customSubtitle = this.buildSuggestedSubtitle(repo, summary, options.angle);
    const callToAction = options.callToAction
      ? `\n## Next step\n\n${options.callToAction}\n`
      : '';

    return [
      `# ${repo.suggestedTitle}`,
      '',
      `> Subtitle: ${customSubtitle}`,
      '',
      `> Canonical source: ${repo.canonicalUrl}`,
      '',
      this.buildOpeningParagraph(summary, options.angle),
      '',
      '## What the repo does',
      '',
      summary,
      '',
      ...(repo.images.length
        ? [
            '## What it looks like',
            '',
            ...repo.images.flatMap((image) => [
              `![${image.alt || image.sourceFile}](${image.url})`,
              ''
            ])
          ]
        : []),
      '## The file that matters',
      '',
      repo.primaryFile ? `\`${repo.primaryFile.path}\`` : 'No primary file was detected.',
      '',
      this.buildCodeExcerpt(repo.primaryFile),
      '',
      ...this.buildRunSection(repo.readmeContent),
      '## What to look at first',
      '',
      repo.primaryFile
        ? `Start with \`${repo.primaryFile.path}\` because that is where the useful logic sits.`
        : 'Start with the README, then move to the main source file.',
      '',
      '## Repo layout',
      '',
      fileList || '- No files found.',
      '',
      '## Bottom line',
      '',
      'This repo is useful when you want the actual working path, not a padded explanation. Lift the exact parts you need, keep the assumptions obvious, and test the request path before you trust the output.',
      callToAction.trimEnd()
    ]
      .filter((section) => section.length > 0)
      .join('\n');
  }

  private buildWriterReadyMarkdown(markdown: string) {
    const lines = markdown.replace(/\r\n/g, '\n').split('\n');
    const nextLines: string[] = [];
    let skippedTitle = false;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!skippedTitle && /^#\s+/.test(trimmed)) {
        skippedTitle = true;
        continue;
      }

      if (/^>\s*(Subtitle|Canonical source|Reader promise):/i.test(trimmed)) {
        continue;
      }

      nextLines.push(line);
    }

    return nextLines.join('\n').replace(/^\s+/, '').replace(/\n{3,}/g, '\n\n').trim();
  }

  private async fetchRawContent(rawUrl: string) {
    const response = await axios.get<string>(rawUrl, {
      headers: this.buildHeaders(),
      responseType: 'text'
    });

    return response.data;
  }

  async importRepository(reference: string, options: FetchRepoOptions = {}): Promise<ImportedGitHubRepo> {
    const normalizedOptions: Required<FetchRepoOptions> = {
      includeFileContents: options.includeFileContents ?? true,
      maxFileChars: options.maxFileChars ?? 20000,
      maxFiles: options.maxFiles ?? 8
    };

    const { owner, repo } = this.parseRepoReference(reference);
    const repoResponse = await axios.get<GitHubRepoResponse>(`${this.baseUrl}/repos/${owner}/${repo}`, {
      headers: this.buildHeaders()
    });

    let readmeContent: string | null = null;
    try {
      const readmeResponse = await axios.get<string>(`${this.baseUrl}/repos/${owner}/${repo}/readme`, {
        headers: {
          ...this.buildHeaders(),
          Accept: 'application/vnd.github.raw'
        },
        responseType: 'text'
      });
      readmeContent = readmeResponse.data;
    } catch (error: any) {
      if (error?.response?.status !== 404) {
        throw error;
      }
    }

    const treeResponse = await axios.get<GitHubTreeResponse>(
      `${this.baseUrl}/repos/${owner}/${repo}/git/trees/${repoResponse.data.default_branch}?recursive=1`,
      {
        headers: this.buildHeaders()
      }
    );

    const candidateEntries = treeResponse.data.tree
      .filter((entry) => entry.type === 'blob')
      .filter((entry) => this.isInterestingFile(entry.path))
      .sort((left, right) => this.scoreFileForImport(right.path, right.size || 0) - this.scoreFileForImport(left.path, left.size || 0))
      .slice(0, normalizedOptions.maxFiles);

    const files = await Promise.all(
      candidateEntries.map(async (entry) => {
        const rawUrl = this.buildRawFileUrl(owner, repo, repoResponse.data.default_branch, entry.path);
        const normalized: ImportedGitHubRepoFile = {
          filename: entry.path.split('/').pop() || entry.path,
          path: entry.path,
          type: this.inferMimeType(entry.path),
          language: this.inferLanguageFromPath(entry.path),
          rawUrl,
          size: entry.size || 0,
          truncated: false
        };

        if (!normalizedOptions.includeFileContents) {
          return normalized;
        }

        const content = await this.fetchRawContent(rawUrl);
        const result = this.truncateContent(content, normalizedOptions.maxFileChars);
        normalized.content = result.content;
        normalized.truncated = result.truncated;
        return normalized;
      })
    );

    const primaryFile = this.choosePrimaryFile(files);
    const readmePath = files.find((file) => /^readme/i.test(file.filename))?.path || 'README.md';
    const images = this.extractImagesFromMarkdown(
      readmeContent,
      owner,
      repo,
      repoResponse.data.default_branch,
      readmePath
    );
    const readmeTitle = this.extractReadmeTitle(readmeContent);
    const readmeSummary = this.extractReadmeSummary(readmeContent, repoResponse.data.description);
    const suggestedTitle = this.buildSuggestedTitle(repoResponse.data, readmeTitle, readmeSummary, primaryFile);
    const suggestedTags = [
      ...this.buildTopicTags(repoResponse.data.topics || []),
      ...suggestMediumTags(files, repoResponse.data.description, undefined, undefined)
        .filter((tag) => !['Documentation', 'Text'].includes(tag))
    ].filter((tag, index, list) => Boolean(tag) && list.indexOf(tag) === index).slice(0, 5);
    const draftStrategy = buildMediumDraftStrategy({
      gist: {
        canonicalUrl: repoResponse.data.html_url,
        description: repoResponse.data.description,
        files,
        images,
        ownerLogin: repoResponse.data.owner.login,
        primaryFile,
        suggestedTitle
      },
      suggestedTags
    });

    const importedRepo: ImportedGitHubRepo = {
      canonicalUrl: repoResponse.data.html_url,
      createdAt: repoResponse.data.created_at,
      defaultBranch: repoResponse.data.default_branch,
      description: repoResponse.data.description,
      files,
      fullName: repoResponse.data.full_name,
      images,
      isPrivate: repoResponse.data.private,
      name: repoResponse.data.name,
      ownerLogin: repoResponse.data.owner.login,
      primaryFile,
      pushedAt: repoResponse.data.pushed_at,
      readmeContent,
      suggestedTags,
      suggestedTitle,
      topics: repoResponse.data.topics || [],
      updatedAt: repoResponse.data.updated_at,
      url: repoResponse.data.html_url,
      writerBrief: ''
    };

    importedRepo.writerBrief = this.buildWriterBrief(importedRepo, draftStrategy);
    return importedRepo;
  }

  async prepareMediumDraft(reference: string, options: PrepareRepoDraftOptions = {}): Promise<PreparedGitHubRepoDraft> {
    const repo = await this.importRepository(reference, options);
    const mediumTags = suggestMediumTags(repo.files, repo.description, options.angle, options.audience);
    const draftStrategy = buildMediumDraftStrategy({
      gist: {
        canonicalUrl: repo.canonicalUrl,
        description: repo.description,
        files: repo.files,
        images: repo.images,
        ownerLogin: repo.ownerLogin,
        primaryFile: repo.primaryFile,
        suggestedTitle: repo.suggestedTitle
      },
      angle: options.angle,
      audience: options.audience,
      suggestedTags: mediumTags
    });
    const mediumMarkdown = this.buildDraftMarkdown(repo, options);
    const repoSummary = this.extractReadmeSummary(repo.readmeContent, repo.description);
    const customSubtitle = this.buildSuggestedSubtitle(repo, repoSummary, options.angle);
    const customSeoDescription = this.stripHtmlTags(repoSummary);
    const mediumOptimization = optimizeMediumDraftPackage({
      title: repo.suggestedTitle,
      subtitle: customSubtitle,
      markdown: mediumMarkdown,
      tags: [
        ...this.buildTopicTags(repo.topics),
        ...mediumTags.filter((tag) => !['Documentation', 'Text'].includes(tag))
      ].filter((tag, index, list) => Boolean(tag) && list.indexOf(tag) === index).slice(0, 5),
      seoTitle: repo.suggestedTitle,
      seoDescription: customSeoDescription,
      hasCoverImage: false,
      audience: options.audience
    });
    const mediumArticleOptimization = optimizeMediumArticleDraft({
      title: mediumOptimization.optimized.title,
      subtitle: mediumOptimization.optimized.subtitle,
      intro: mediumOptimization.optimized.intro,
      markdown: mediumOptimization.optimized.markdown,
      tags: mediumOptimization.optimized.tags,
      seoTitle: mediumOptimization.optimized.seoTitle,
      seoDescription: mediumOptimization.optimized.seoDescription,
      hasCoverImage: false,
      audience: options.audience
    });
    const mediumTitle = mediumArticleOptimization.optimized.title;
    const mediumBodyMarkdown = this.buildWriterReadyMarkdown(mediumArticleOptimization.optimized.markdown);
    const mediumAudit = auditMediumDraft({
      title: mediumTitle,
      subtitle: mediumArticleOptimization.optimized.subtitle,
      markdown: mediumBodyMarkdown,
      tags: mediumArticleOptimization.optimized.tags,
      seoTitle: mediumArticleOptimization.optimized.seoTitle,
      seoDescription: mediumArticleOptimization.optimized.seoDescription,
      hasCoverImage: false
    });

    return {
      ...repo,
      mediumArticleOptimization,
      draftStrategy,
      mediumAudit,
      mediumBodyMarkdown,
      mediumMarkdown: mediumArticleOptimization.optimized.markdown,
      mediumOptimization,
      mediumSeoDescription: mediumArticleOptimization.optimized.seoDescription,
      mediumSeoTitle: mediumArticleOptimization.optimized.seoTitle,
      mediumSubtitle: mediumArticleOptimization.optimized.subtitle,
      mediumTags: mediumArticleOptimization.optimized.tags,
      mediumTitle
    };
  }
}

export default GitHubRepoClient;
