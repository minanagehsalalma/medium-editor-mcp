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

interface GitHubGistOwner {
  login?: string;
}

interface GitHubGistFileResponse {
  filename?: string;
  type?: string;
  language?: string | null;
  raw_url?: string;
  size?: number;
  truncated?: boolean;
  content?: string;
}

interface GitHubGistResponse {
  id: string;
  html_url: string;
  description: string | null;
  public: boolean;
  created_at: string;
  updated_at: string;
  owner?: GitHubGistOwner | null;
  files: Record<string, GitHubGistFileResponse | null>;
}

interface FetchGistOptions {
  includeFileContents?: boolean;
  maxFileChars?: number;
}

interface PrepareDraftOptions extends FetchGistOptions {
  angle?: string;
  audience?: string;
  callToAction?: string;
}

export interface ImportedGistFile {
  filename: string;
  type: string | null;
  language: string | null;
  rawUrl: string | null;
  size: number;
  truncated: boolean;
  content?: string;
}

export interface ImportedGistImage {
  alt: string | null;
  sourceFile: string;
  url: string;
}

export interface ImportedGist {
  id: string;
  url: string;
  description: string | null;
  public: boolean;
  createdAt: string;
  updatedAt: string;
  ownerLogin: string | null;
  files: ImportedGistFile[];
  images: ImportedGistImage[];
  primaryFile: ImportedGistFile | null;
  suggestedTitle: string;
  suggestedTags: string[];
  canonicalUrl: string;
  writerBrief: string;
}

export interface PreparedGistDraft extends ImportedGist {
  mediumArticleOptimization: MediumArticleOptimizationResult;
  draftStrategy: MediumDraftStrategy;
  mediumAudit: MediumDraftAuditResult;
  mediumBodyMarkdown: string;
  mediumOptimization: MediumDraftPackageOptimizationResult;
  mediumSeoDescription: string;
  mediumSeoTitle: string;
  mediumSubtitle: string;
  mediumTitle: string;
  mediumTags: string[];
  mediumMarkdown: string;
}

class GistClient {
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

  private parseGistId(reference: string): string {
    const trimmed = reference.trim();

    try {
      const url = new URL(trimmed);
      if (url.hostname !== 'gist.github.com') {
        throw new Error('Only gist.github.com URLs are supported.');
      }

      const segments = url.pathname.split('/').filter(Boolean);
      const gistId = segments[segments.length - 1];
      if (!gistId) {
        throw new Error('Could not determine gist ID from URL.');
      }

      return gistId;
    } catch {
      if (/^[a-f0-9]+$/i.test(trimmed)) {
        return trimmed;
      }

      throw new Error('Expected a GitHub Gist URL or raw gist ID.');
    }
  }

  private extractImagesFromContent(content: string | undefined, sourceFile: string): ImportedGistImage[] {
    if (!content) {
      return [];
    }

    const images: ImportedGistImage[] = [];
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

    const markdownImagePattern = /!\[([^\]]*)\]\((https?:\/\/[^)\s]+)(?:\s+"[^"]*")?\)/gi;
    const htmlImagePattern = /<img\b[^>]*?\bsrc=["'](https?:\/\/[^"']+)["'][^>]*>/gi;

    let markdownMatch: RegExpExecArray | null;
    while ((markdownMatch = markdownImagePattern.exec(content)) !== null) {
      pushImage(markdownMatch[2], markdownMatch[1]);
    }

    let htmlMatch: RegExpExecArray | null;
    while ((htmlMatch = htmlImagePattern.exec(content)) !== null) {
      const tag = htmlMatch[0];
      const altMatch = tag.match(/\balt=["']([^"']+)["']/i);
      pushImage(htmlMatch[1], altMatch?.[1] || null);
    }

    return images;
  }

  private async fetchRawContent(rawUrl: string): Promise<string> {
    const response = await axios.get<string>(rawUrl, {
      headers: this.buildHeaders(),
      responseType: 'text'
    });

    return response.data;
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

  private async mapFile(file: GitHubGistFileResponse, options: Required<FetchGistOptions>): Promise<ImportedGistFile> {
    const normalized: ImportedGistFile = {
      filename: file.filename || 'untitled',
      type: file.type || null,
      language: file.language || null,
      rawUrl: file.raw_url || null,
      size: file.size || 0,
      truncated: Boolean(file.truncated)
    };

    if (!options.includeFileContents) {
      return normalized;
    }

    let content = file.content;
    let truncated = Boolean(file.truncated);

    if ((!content || truncated) && file.raw_url) {
      content = await this.fetchRawContent(file.raw_url);
      truncated = false;
    }

    if (content) {
      const result = this.truncateContent(content, options.maxFileChars);
      normalized.content = result.content;
      normalized.truncated = truncated || result.truncated;
    }

    return normalized;
  }

  private choosePrimaryFile(files: ImportedGistFile[]): ImportedGistFile | null {
    if (!files.length) {
      return null;
    }

    const markdownFile = files.find((file) => /\.md$/i.test(file.filename));
    if (markdownFile) {
      return markdownFile;
    }

    const readme = files.find((file) => /^readme/i.test(file.filename));
    if (readme) {
      return readme;
    }

    return [...files].sort((left, right) => right.size - left.size)[0];
  }

  private buildSuggestedTitle(description: string | null, primaryFile: ImportedGistFile | null): string {
    const fromDescription = description?.trim();
    if (fromDescription) {
      return fromDescription.replace(/\s+/g, ' ').trim();
    }

    if (primaryFile) {
      const stem = primaryFile.filename.replace(/\.[^.]+$/, '');
      return stem
        .replace(/[-_]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/\b\w/g, (character) => character.toUpperCase());
    }

    return 'Imported GitHub Gist';
  }

  private buildSuggestedTags(
    files: ImportedGistFile[],
    description: string | null,
    options?: Pick<PrepareDraftOptions, 'angle' | 'audience'>
  ): string[] {
    return suggestMediumTags(files, description, options?.angle, options?.audience);
  }

  private buildWriterBrief(gist: Omit<ImportedGist, 'writerBrief'>, strategy: MediumDraftStrategy): string {
    const fileSummary = gist.files
      .map((file) => `${file.filename}${file.language ? ` (${file.language})` : ''}`)
      .join(', ');
    const imageSummary = gist.images.length
      ? `Available gist images: ${gist.images.map((image) => image.sourceFile).join(', ')}.`
      : 'No inline gist images were detected.';

    return [
      `Use ${gist.url} as the canonical source for the article.`,
      `Target subtitle/dek: ${strategy.suggestedSubtitle}`,
      'Start with the actual problem, not a definition.',
      gist.primaryFile
        ? `Center the walkthrough on ${gist.primaryFile.filename} and only reference supporting files when they materially change the explanation.`
        : 'Explain the overall gist structure before diving into file-level details.',
      `Opening direction: ${strategy.openingHook}`,
      `Cover image brief: ${strategy.coverImageBrief}`,
      `Recommended tag order: ${strategy.recommendedTagOrder.join(', ') || 'Software Engineering'}.`,
      'Write like an engineer describing a real fix, not a generic thought-leadership post.',
      `Available source files: ${fileSummary || 'none'}.`,
      imageSummary,
      'Keep the wording direct, actionable, and easy to skim.'
    ].join(' ');
  }

  private buildCodeFence(file: ImportedGistFile | null): string {
    if (!file?.content) {
      return '_No file content was included in this import._';
    }

    const language = file.language?.toLowerCase() || '';
    return `\`\`\`${language}\n${file.content}\n\`\`\``;
  }

  private buildProblemSummary(gist: ImportedGist, options: PrepareDraftOptions) {
    const description = gist.description?.trim();
    if (description) {
      return description.endsWith('.') ? description : `${description}.`;
    }

    const primaryFile = gist.primaryFile?.filename;
    const angle = options.angle?.trim();
    const base = primaryFile
      ? `This gist is built around ${primaryFile} and solves one concrete problem without adding extra setup.`
      : 'This gist solves one concrete problem without adding extra setup.';
    return angle ? `${base} Focus on ${angle}.` : base;
  }

  private buildActionParagraph(gist: ImportedGist) {
    const primaryFile = gist.primaryFile;
    if (!primaryFile) {
      return 'Read the gist from top to bottom, keep the moving parts small, and lift only the pieces that solve your exact problem.';
    }

    const supportingFileCount = Math.max(0, gist.files.length - 1);
    const supportingClause = supportingFileCount
      ? ` Use the ${supportingFileCount} supporting file${supportingFileCount === 1 ? '' : 's'} only where they change the outcome.`
      : '';
    const languageClause = primaryFile.language ? ` It is written in ${primaryFile.language}.` : '';
    return `Start with ${primaryFile.filename} because that is where the useful logic lives.${languageClause}${supportingClause}`;
  }

  private buildImageSection(images: ImportedGistImage[]) {
    if (!images.length) {
      return [] as string[];
    }

    return [
      '## What it looks like',
      '',
      ...images.flatMap((image) => [
        `![${image.alt || image.sourceFile}](${image.url})`,
        ''
      ])
    ];
  }

  private buildDraftMarkdown(gist: ImportedGist, options: PrepareDraftOptions): string {
    const draftStrategy = buildMediumDraftStrategy({
      gist,
      angle: options.angle,
      audience: options.audience,
      suggestedTags: gist.suggestedTags
    });
    const title = gist.suggestedTitle;
    const fileList = gist.files.map((file) => `- \`${file.filename}\`${file.language ? ` (${file.language})` : ''}`).join('\n');
    const callToAction = options.callToAction
      ? `\n## Next step\n\n${options.callToAction}\n`
      : '';

    return [
      `# ${title}`,
      '',
      `> Subtitle: ${draftStrategy.suggestedSubtitle}`,
      '',
      `> Canonical source: ${gist.canonicalUrl}`,
      '',
      draftStrategy.openingHook,
      '',
      '## The problem',
      '',
      this.buildProblemSummary(gist, options),
      '',
      ...this.buildImageSection(gist.images),
      '## The fix',
      '',
      this.buildActionParagraph(gist),
      '',
      '## Source files',
      '',
      fileList || '- No files found.',
      '',
      '## The key file',
      '',
      gist.primaryFile ? `\`${gist.primaryFile.filename}\`` : 'No primary file was detected.',
      '',
      this.buildCodeFence(gist.primaryFile),
      '',
      '## What to pay attention to',
      '',
      'Keep the explanation concrete. Show the exact part that matters, say why it exists, and cut anything that reads like filler.',
      '',
      '## Before you reuse it',
      '',
      '- Check the environment-specific assumptions first.',
      '- Verify the dependency or service that can fail silently.',
      '- Keep the fallback or rollback path obvious.',
      callToAction.trimEnd()
    ]
      .filter((section) => section.length > 0)
      .join('\n');
  }

  private buildWriterReadyMarkdown(markdown: string): string {
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

  async importGist(reference: string, options: FetchGistOptions = {}): Promise<ImportedGist> {
    const normalizedOptions: Required<FetchGistOptions> = {
      includeFileContents: options.includeFileContents ?? true,
      maxFileChars: options.maxFileChars ?? 20000
    };

    const gistId = this.parseGistId(reference);
    const response = await axios.get<GitHubGistResponse>(`${this.baseUrl}/gists/${gistId}`, {
      headers: this.buildHeaders()
    });

    const fileResponses = Object.values(response.data.files).filter(
      (file): file is GitHubGistFileResponse => Boolean(file)
    );

    const files = await Promise.all(fileResponses.map((file) => this.mapFile(file, normalizedOptions)));
    const images = files.flatMap((file) => this.extractImagesFromContent(file.content, file.filename));
    const primaryFile = this.choosePrimaryFile(files);
    const suggestedTitle = this.buildSuggestedTitle(response.data.description, primaryFile);
    const suggestedTags = this.buildSuggestedTags(files, response.data.description);
    const draftStrategy = buildMediumDraftStrategy({
      gist: {
        canonicalUrl: response.data.html_url,
        description: response.data.description,
        files,
        images,
        ownerLogin: response.data.owner?.login || null,
        primaryFile,
        suggestedTitle
      },
      suggestedTags
    });

    const gist: ImportedGist = {
      id: response.data.id,
      url: response.data.html_url,
      description: response.data.description,
      public: response.data.public,
      createdAt: response.data.created_at,
      updatedAt: response.data.updated_at,
      ownerLogin: response.data.owner?.login || null,
      files,
      images,
      primaryFile,
      suggestedTitle,
      suggestedTags,
      canonicalUrl: response.data.html_url,
      writerBrief: ''
    };

    gist.writerBrief = this.buildWriterBrief(gist, draftStrategy);
    return gist;
  }

  async prepareMediumDraft(reference: string, options: PrepareDraftOptions = {}): Promise<PreparedGistDraft> {
    const gist = await this.importGist(reference, options);
    const mediumTags = this.buildSuggestedTags(gist.files, gist.description, options);
    const draftStrategy = buildMediumDraftStrategy({
      gist,
      angle: options.angle,
      audience: options.audience,
      suggestedTags: mediumTags
    });
    const mediumMarkdown = this.buildDraftMarkdown(gist, options);
    const mediumOptimization = optimizeMediumDraftPackage({
      title: gist.suggestedTitle,
      subtitle: draftStrategy.suggestedSubtitle,
      markdown: mediumMarkdown,
      tags: draftStrategy.recommendedTagOrder,
      seoTitle: draftStrategy.suggestedSeoTitle,
      seoDescription: draftStrategy.suggestedSeoDescription,
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
      ...gist,
      mediumArticleOptimization,
      draftStrategy,
      mediumAudit,
      mediumBodyMarkdown,
      mediumOptimization,
      mediumSeoDescription: mediumArticleOptimization.optimized.seoDescription,
      mediumSeoTitle: mediumArticleOptimization.optimized.seoTitle,
      mediumSubtitle: mediumArticleOptimization.optimized.subtitle,
      mediumTitle,
      mediumTags: mediumArticleOptimization.optimized.tags,
      mediumMarkdown: mediumArticleOptimization.optimized.markdown
    };
  }
}

export default GistClient;
