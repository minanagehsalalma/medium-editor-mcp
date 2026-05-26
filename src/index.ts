import { config } from 'dotenv';
import * as fs from 'fs';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import MediumAuth from './auth';
import MediumClient from './client';
import GistClient from './gist';
import GitHubRepoClient from './github-repo';
import MediumGraphqlClient from './medium-graphql';
import MediumGraphqlDiscovery, {
  buildOperationRegistryDocument,
  MediumGraphqlRegistryDocument
} from './medium-graphql-discovery';
import MediumLegacyEditorClient from './medium-legacy-editor';
import MediumPostWorkflows from './medium-post-workflows';
import MediumRichDraftWriter, { MediumRichDraftBlock } from './medium-rich-draft';
import MediumWebClient from './medium-web';
import { auditMediumDraft } from './medium-draft-audit';
import { optimizeMediumDraftPackage } from './medium-draft-optimizer';
import { optimizeMediumArticleDraft } from './medium-article-optimizer';
import setupMediumSession, {
  buildMediumSessionSetupGuide
} from './medium-session-setup';
import { inspectMediumSessionConfig } from './medium-session';
import MediumDoctor from './medium-doctor';

config();

const publishArticleInput: any = {
  title: z.string().min(1, 'Title is required').max(100, 'Medium ignores titles longer than 100 characters'),
  content: z.string().min(10, 'Content must be at least 10 characters'),
  contentFormat: z.enum(['markdown', 'html']).optional(),
  tags: z.array(z.string()).max(5, 'Provide at most 5 tags; Medium uses only the first 3').optional(),
  publicationId: z.string().optional(),
  publishStatus: z.enum(['public', 'draft', 'unlisted']).optional(),
  notifyFollowers: z.boolean().optional(),
  canonicalUrl: z.string().url().optional(),
  license: z.enum([
    'all-rights-reserved',
    'cc-40-by',
    'cc-40-by-sa',
    'cc-40-by-nd',
    'cc-40-by-nc',
    'cc-40-by-nc-nd',
    'cc-40-by-nc-sa',
    'cc-40-zero',
    'public-domain'
  ]).optional()
};

const publicationContributorsInput: any = {
  publicationId: z.string().min(1, 'Publication ID is required')
};

const importGistInput: any = {
  gist: z.string().min(1, 'Gist URL or ID is required'),
  includeFileContents: z.boolean().optional(),
  maxFileChars: z.number().int().min(500).max(100000).optional()
};

const importGitHubRepoInput: any = {
  repo: z.string().min(1, 'GitHub repository URL or owner/repo is required'),
  includeFileContents: z.boolean().optional(),
  maxFileChars: z.number().int().min(500).max(100000).optional(),
  maxFiles: z.number().int().min(1).max(40).optional()
};

const setupMediumSessionInput: any = {
  cookiesJson: z.string().optional(),
  cookieHeader: z.string().optional(),
  cookiesFile: z.string().optional(),
  sessionFile: z.string().optional(),
  envFile: z.string().optional(),
  writeEnvFile: z.boolean().optional(),
  setProcessEnv: z.boolean().optional(),
  probeAfterSetup: z.boolean().optional()
};

const prepareGistDraftInput: any = {
  gist: z.string().min(1, 'Gist URL or ID is required'),
  angle: z.string().optional(),
  audience: z.string().optional(),
  callToAction: z.string().optional(),
  includeFileContents: z.boolean().optional(),
  maxFileChars: z.number().int().min(500).max(100000).optional()
};

const prepareGitHubRepoDraftInput: any = {
  repo: z.string().min(1, 'GitHub repository URL or owner/repo is required'),
  angle: z.string().optional(),
  audience: z.string().optional(),
  callToAction: z.string().optional(),
  includeFileContents: z.boolean().optional(),
  maxFileChars: z.number().int().min(500).max(100000).optional(),
  maxFiles: z.number().int().min(1).max(40).optional()
};

const auditMediumDraftInput: any = {
  title: z.string().min(1, 'Title is required'),
  subtitle: z.string().optional(),
  markdown: z.string().min(1, 'Markdown is required'),
  tagsJson: z.string().optional(),
  seoTitle: z.string().optional(),
  seoDescription: z.string().optional(),
  hasCoverImage: z.boolean().optional()
};

const optimizeMediumDraftPackageInput: any = {
  title: z.string().min(1, 'Title is required'),
  subtitle: z.string().optional(),
  intro: z.string().optional(),
  markdown: z.string().min(1, 'Markdown is required'),
  tagsJson: z.string().optional(),
  seoTitle: z.string().optional(),
  seoDescription: z.string().optional(),
  hasCoverImage: z.boolean().optional(),
  audience: z.string().optional()
};

const optimizeMediumArticleDraftInput: any = {
  title: z.string().min(1, 'Title is required'),
  subtitle: z.string().optional(),
  intro: z.string().optional(),
  markdown: z.string().min(1, 'Markdown is required'),
  tagsJson: z.string().optional(),
  seoTitle: z.string().optional(),
  seoDescription: z.string().optional(),
  hasCoverImage: z.boolean().optional(),
  audience: z.string().optional(),
  maxPasses: z.number().int().min(1).max(10).optional(),
  minScore: z.number().int().min(1).max(100).optional()
};

const createOptimizedMediumRichDraftInput: any = {
  title: z.string().min(1, 'Title is required'),
  subtitle: z.string().optional(),
  intro: z.string().optional(),
  markdown: z.string().min(1, 'Markdown is required'),
  tagsJson: z.string().optional(),
  seoTitle: z.string().optional(),
  seoDescription: z.string().optional(),
  hasCoverImage: z.boolean().optional(),
  audience: z.string().optional(),
  maxPasses: z.number().int().min(1).max(10).optional(),
  minScore: z.number().int().min(1).max(100).optional(),
  draftBodyJson: z.string().optional()
};

const testMediumWritePathInput: any = {
  title: z.string().optional(),
  subtitle: z.string().optional(),
  markdown: z.string().optional(),
  draftBodyJson: z.string().optional()
};

const publishOptimizedMediumDraftInput: any = {
  title: z.string().min(1, 'Title is required'),
  subtitle: z.string().optional(),
  intro: z.string().optional(),
  markdown: z.string().min(1, 'Markdown is required'),
  tagNamesJson: z.string().optional(),
  seoTitle: z.string().optional(),
  seoDescription: z.string().optional(),
  canonicalUrl: z.string().url().optional(),
  hasCoverImage: z.boolean().optional(),
  coverImagePath: z.string().optional(),
  coverImageCaption: z.string().optional(),
  audience: z.string().optional(),
  maxPasses: z.number().int().min(1).max(10).optional(),
  minScore: z.number().int().min(1).max(100).optional(),
  draftBodyJson: z.string().optional(),
  optimizeVisibility: z.boolean().optional(),
  createShareKey: z.boolean().optional()
};

const updateArticleInput: any = {
  articleId: z.string().min(1, 'Article ID is required'),
  title: z.string().optional(),
  content: z.string().optional(),
  tags: z.array(z.string()).max(5, 'Provide at most 5 tags; Medium uses only the first 3').optional(),
  publishStatus: z.enum(['public', 'draft', 'unlisted']).optional()
};

const articleIdInput: any = {
  articleId: z.string().min(1, 'Article ID is required')
};

const searchArticlesInput: any = {
  keywords: z.array(z.string()).optional(),
  publicationId: z.string().optional(),
  tags: z.array(z.string()).optional()
};

const createWebDraftInput: any = {
  title: z.string().min(1, 'Title is required'),
  subtitle: z.string().optional(),
  contentMarkdown: z.string().optional(),
  contentHtml: z.string().optional()
};

const createGistWebDraftInput: any = {
  gist: z.string().min(1, 'Gist URL or ID is required'),
  angle: z.string().optional(),
  audience: z.string().optional(),
  callToAction: z.string().optional(),
  subtitle: z.string().optional(),
  includeFileContents: z.boolean().optional(),
  maxFileChars: z.number().int().min(500).max(100000).optional()
};

const mediumGraphqlRequestInput: any = {
  bodyJson: z.string().optional(),
  query: z.string().optional(),
  operationName: z.string().optional(),
  variablesJson: z.string().optional(),
  extensionsJson: z.string().optional(),
  headersJson: z.string().optional(),
  endpoint: z.string().url().optional(),
  source: z.string().optional(),
  referer: z.string().url().optional()
};

const mediumRegisteredOperationInput: any = {
  alias: z.string().min(1, 'Operation alias is required'),
  bodyJson: z.string().optional(),
  headersJson: z.string().optional(),
  endpoint: z.string().url().optional(),
  source: z.string().optional(),
  referer: z.string().url().optional()
};

const mediumLegacyRequestInput: any = {
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE']).optional(),
  path: z.string().min(1, 'Path is required'),
  queryJson: z.string().optional(),
  bodyJson: z.string().optional(),
  headersJson: z.string().optional(),
  referer: z.string().url().optional(),
  accept: z.string().optional(),
  contentType: z.string().optional()
};

const mediumLegacyPostIdInput: any = {
  postId: z.string().min(1, 'Post ID is required')
};

const mediumLegacyDeltasInput: any = {
  postId: z.string().min(1, 'Post ID is required'),
  baseRev: z.number().int()
};

const mediumLegacyApplyDeltasInput: any = {
  postId: z.string().min(1, 'Post ID is required'),
  baseRev: z.number().int(),
  deltasJson: z.string().min(2, 'deltasJson is required'),
  extraBodyJson: z.string().optional()
};

const createMediumLegacyDraftInput: any = {
  bodyJson: z.string().optional()
};

const mediumRichDraftInput: any = {
  title: z.string().min(1, 'Title is required'),
  subtitle: z.string().optional(),
  markdown: z.string().optional(),
  blocksJson: z.string().optional(),
  append: z.boolean().optional(),
  draftBodyJson: z.string().optional()
};

const mediumWriteRichDraftInput: any = {
  postId: z.string().min(1, 'Post ID is required'),
  title: z.string().optional(),
  subtitle: z.string().optional(),
  markdown: z.string().optional(),
  blocksJson: z.string().optional(),
  append: z.boolean().optional()
};

const createGistLegacyDraftInput: any = {
  gist: z.string().min(1, 'Gist URL or ID is required'),
  angle: z.string().optional(),
  audience: z.string().optional(),
  callToAction: z.string().optional(),
  subtitle: z.string().optional(),
  includeFileContents: z.boolean().optional(),
  maxFileChars: z.number().int().min(500).max(100000).optional(),
  append: z.boolean().optional()
};

const createGitHubRepoLegacyDraftInput: any = {
  repo: z.string().min(1, 'GitHub repository URL or owner/repo is required'),
  angle: z.string().optional(),
  audience: z.string().optional(),
  callToAction: z.string().optional(),
  subtitle: z.string().optional(),
  includeFileContents: z.boolean().optional(),
  maxFileChars: z.number().int().min(500).max(100000).optional(),
  maxFiles: z.number().int().min(1).max(40).optional(),
  append: z.boolean().optional()
};

const cloneMediumPostInput: any = {
  postId: z.string().min(1, 'Source post ID is required'),
  title: z.string().optional(),
  subtitle: z.string().optional(),
  tagNamesJson: z.string().optional(),
  seoTitle: z.string().optional(),
  seoDescription: z.string().optional(),
  canonicalUrl: z.string().url().optional(),
  publish: z.boolean().optional(),
  draftBodyJson: z.string().optional()
};

const replaceImportedMediumPostInput: any = {
  postId: z.string().min(1, 'Source post ID is required'),
  title: z.string().optional(),
  subtitle: z.string().optional(),
  tagNamesJson: z.string().optional(),
  seoTitle: z.string().optional(),
  seoDescription: z.string().optional(),
  canonicalUrl: z.string().url().optional(),
  publish: z.boolean().optional(),
  draftBodyJson: z.string().optional(),
  convertOriginalToHistoricalStub: z.boolean().optional(),
  historicalTitle: z.string().optional(),
  historicalSubtitle: z.string().optional(),
  historicalIntro: z.string().optional(),
  historicalSeoTitle: z.string().optional(),
  historicalSeoDescription: z.string().optional()
};

const inspectMediumPostInput: any = {
  postId: z.string().min(1, 'Post ID is required'),
  publicUrl: z.string().url().optional()
};

const optimizeMediumPostInput: any = {
  postId: z.string().min(1, 'Post ID is required'),
  autoRewritePackage: z.boolean().optional(),
  title: z.string().optional(),
  subtitle: z.string().optional(),
  intro: z.string().optional(),
  seoTitle: z.string().optional(),
  seoDescription: z.string().optional(),
  canonicalUrl: z.string().url().optional(),
  coverImagePath: z.string().optional(),
  coverImageCaption: z.string().optional(),
  tagNamesJson: z.string().optional()
};

const optimizeMediumVisibilityInput: any = {
  postId: z.string().min(1, 'Post ID is required'),
  enableResponses: z.boolean().optional(),
  ensurePublishingFlowDefaults: z.boolean().optional(),
  createShareKey: z.boolean().optional()
};

const mediumPostIdInput: any = {
  postId: z.string().min(1, 'Post ID is required')
};

const discoverMediumGraphqlInput: any = {
  pageUrl: z.string().url().optional(),
  maxBundles: z.number().int().min(1).max(40).optional(),
  operationName: z.string().optional()
};

const captureMediumGraphqlOperationsInput: any = {
  pageUrl: z.string().url(),
  aliasesJson: z.string().min(2, 'Provide a JSON object mapping alias names to operation names.'),
  maxBundles: z.number().int().min(1).max(40).optional(),
  outputFile: z.string().optional(),
  merge: z.boolean().optional(),
  source: z.string().optional()
};

const jsonContent = (value: unknown) => ({
  content: [
    {
      type: 'text' as const,
      text: JSON.stringify(value, null, 2)
    }
  ]
});

const errorContent = (message: string) => ({
  isError: true,
  content: [
    {
      type: 'text' as const,
      text: message
    }
  ]
});

const parseOptionalJson = <T>(label: string, value?: string): T | undefined => {
  if (!value) {
    return undefined;
  }

  try {
    return JSON.parse(value) as T;
  } catch (error: any) {
    throw new Error(`Invalid ${label}: ${error.message}`);
  }
};

class MediumMcpServer {
  private server: McpServer;
  private mediumClient: MediumClient;
  private auth: MediumAuth;
  private gistClient: GistClient;
  private gitHubRepoClient: GitHubRepoClient;
  private mediumGraphqlClient: MediumGraphqlClient;
  private mediumGraphqlDiscovery: MediumGraphqlDiscovery;
  private mediumLegacyEditorClient: MediumLegacyEditorClient;
  private mediumDoctor: MediumDoctor;
  private mediumPostWorkflows: MediumPostWorkflows;
  private mediumRichDraftWriter: MediumRichDraftWriter;
  private mediumWebClient: MediumWebClient;

  constructor() {
    this.auth = new MediumAuth();
    this.mediumClient = new MediumClient(this.auth);
    this.gistClient = new GistClient();
    this.gitHubRepoClient = new GitHubRepoClient();
    this.mediumGraphqlClient = new MediumGraphqlClient();
    this.mediumGraphqlDiscovery = new MediumGraphqlDiscovery(this.mediumGraphqlClient);
    this.mediumLegacyEditorClient = new MediumLegacyEditorClient();
    this.mediumDoctor = new MediumDoctor(this.mediumGraphqlClient);
    this.mediumPostWorkflows = new MediumPostWorkflows(this.mediumLegacyEditorClient, this.mediumGraphqlClient);
    this.mediumRichDraftWriter = new MediumRichDraftWriter(this.mediumLegacyEditorClient);
    this.mediumWebClient = new MediumWebClient();

    this.server = new McpServer({
      name: 'medium-mcp-server',
      version: '1.1.0'
    });

    this.registerTools();
  }

  private registerSupportedTools() {
    this.server.tool(
      'publish-article',
      'Publish a new Medium article or draft using the still-documented create-post endpoint.',
      publishArticleInput,
      async (args: any) => {
        try {
          await this.auth.authenticate();
          const result = await this.mediumClient.publishArticle(args);
          return jsonContent(result);
        } catch (error: any) {
          return errorContent(`Error publishing article: ${error.message}`);
        }
      }
    );

    this.server.tool(
      'get-user-profile',
      'Retrieve the authenticated Medium user profile.',
      {},
      async () => {
        try {
          await this.auth.authenticate();
          return jsonContent(await this.mediumClient.getUserProfile());
        } catch (error: any) {
          return errorContent(`Error retrieving user profile: ${error.message}`);
        }
      }
    );

    this.server.tool(
      'get-publications',
      'Retrieve Medium publications related to the authenticated user.',
      {},
      async () => {
        try {
          await this.auth.authenticate();
          return jsonContent(await this.mediumClient.getUserPublications());
        } catch (error: any) {
          return errorContent(`Error retrieving publications: ${error.message}`);
        }
      }
    );

    this.server.tool(
      'get-publication-contributors',
      'Retrieve contributor roles for a Medium publication.',
      publicationContributorsInput,
      async (args: any) => {
        try {
          await this.auth.authenticate();
          return jsonContent(await this.mediumClient.getPublicationContributors(args.publicationId));
        } catch (error: any) {
          return errorContent(`Error retrieving publication contributors: ${error.message}`);
        }
      }
    );

    this.server.tool(
      'doctor-medium-mcp',
      'Run a full Medium MCP health check across session loading, session probe, transport, operation registry, and workflow readiness.',
      {},
      async () => {
        try {
          return jsonContent(await this.mediumDoctor.run());
        } catch (error: any) {
          return errorContent(`Error running Medium MCP doctor: ${error.message}`);
        }
      }
    );

    this.server.tool(
      'inspect-medium-session-config',
      'Inspect the current Medium session configuration, show which cookie source is active, and report missing cookies or loader problems before probing or publishing.',
      {},
      async () => {
        try {
          return jsonContent({
            ...inspectMediumSessionConfig(),
            setupGuide: buildMediumSessionSetupGuide()
          });
        } catch (error: any) {
          return errorContent(`Error inspecting Medium session config: ${error.message}`);
        }
      }
    );

    this.server.tool(
      'setup-medium-session',
      'Normalize Medium cookies from JSON, a raw Cookie header, or a cookie file, write a local medium-cookies.json file, optionally update .env, and probe the session immediately.',
      setupMediumSessionInput,
      async (args: any) => {
        try {
          const result = setupMediumSession({
            cookiesJson: args.cookiesJson,
            cookieHeader: args.cookieHeader,
            cookiesFile: args.cookiesFile,
            sessionFile: args.sessionFile,
            envFile: args.envFile,
            writeEnvFile: args.writeEnvFile,
            setProcessEnv: args.setProcessEnv
          });

          const probe = args.probeAfterSetup === false
            ? null
            : await this.mediumGraphqlClient.probeSession();

          return jsonContent({
            ...result,
            probe,
            setupGuide: buildMediumSessionSetupGuide()
          });
        } catch (error: any) {
          return errorContent(`Error setting up Medium session: ${error.message}`);
        }
      }
    );

    this.server.tool(
      'test-medium-write-path',
      'Create a disposable Medium draft, write a small verification sample, read it back, and confirm the legacy editor write path is healthy.',
      testMediumWritePathInput,
      async (args: any) => {
        try {
          const draftBody = parseOptionalJson<Record<string, unknown>>('draftBodyJson', args.draftBodyJson);
          return jsonContent(await this.mediumPostWorkflows.testWritePath({
            title: args.title,
            subtitle: args.subtitle,
            markdown: args.markdown,
            draftBody
          }));
        } catch (error: any) {
          return errorContent(`Error testing Medium write path: ${error.message}`);
        }
      }
    );

    this.server.tool(
      'import-gist',
      'Import a GitHub Gist URL or ID and return normalized source material for writing a Medium post.',
      importGistInput,
      async (args: any) => {
        try {
          return jsonContent(await this.gistClient.importGist(args.gist, args));
        } catch (error: any) {
          return errorContent(`Error importing gist: ${error.message}`);
        }
      }
    );

    this.server.tool(
      'import-github-repo',
      'Import a GitHub repository by URL or owner/repo, fetch the README plus key files, and normalize the repo into a Medium-friendly source package.',
      importGitHubRepoInput,
      async (args: any) => {
        try {
          return jsonContent(await this.gitHubRepoClient.importRepository(args.repo, args));
        } catch (error: any) {
          return errorContent(`Error importing GitHub repo: ${error.message}`);
        }
      }
    );

    this.server.tool(
      'prepare-gist-draft',
      'Build a Medium-ready draft template from a GitHub Gist with Medium-specific title, subtitle, SEO, tag, and readability heuristics baked in.',
      prepareGistDraftInput,
      async (args: any) => {
        try {
          return jsonContent(await this.gistClient.prepareMediumDraft(args.gist, args));
        } catch (error: any) {
          return errorContent(`Error preparing gist draft: ${error.message}`);
        }
      }
    );

    this.server.tool(
      'prepare-github-repo-draft',
      'Prepare a Medium-oriented article draft from a GitHub repository, using the README, repo images, and key files instead of a gist source.',
      prepareGitHubRepoDraftInput,
      async (args: any) => {
        try {
          return jsonContent(await this.gitHubRepoClient.prepareMediumDraft(args.repo, args));
        } catch (error: any) {
          return errorContent(`Error preparing GitHub repo draft: ${error.message}`);
        }
      }
    );

    this.server.tool(
      'audit-medium-draft',
      'Score a Medium draft package for hook strength, scanability, and distribution readiness, then return concrete fixes before publication.',
      auditMediumDraftInput,
      async (args: any) => {
        try {
          const tags = parseOptionalJson<string[]>('tagsJson', args.tagsJson);
          return jsonContent(auditMediumDraft({
            title: args.title,
            subtitle: args.subtitle,
            markdown: args.markdown,
            tags,
            seoTitle: args.seoTitle,
            seoDescription: args.seoDescription,
            hasCoverImage: args.hasCoverImage
          }));
        } catch (error: any) {
          return errorContent(`Error auditing Medium draft: ${error.message}`);
        }
      }
    );

    this.server.tool(
      'optimize-medium-draft-package',
      'Rewrite a Medium draft package into a stronger title, subtitle, intro, SEO, and tag set, then show the before/after audit scores.',
      optimizeMediumDraftPackageInput,
      async (args: any) => {
        try {
          const tags = parseOptionalJson<string[]>('tagsJson', args.tagsJson);
          return jsonContent(optimizeMediumDraftPackage({
            title: args.title,
            subtitle: args.subtitle,
            intro: args.intro,
            markdown: args.markdown,
            tags,
            seoTitle: args.seoTitle,
            seoDescription: args.seoDescription,
            hasCoverImage: args.hasCoverImage,
            audience: args.audience
          }));
        } catch (error: any) {
          return errorContent(`Error optimizing Medium draft package: ${error.message}`);
        }
      }
    );

    this.server.tool(
      'optimize-medium-article-draft',
      'Iteratively rewrite a Medium article draft for stronger packaging and better body structure until the audit stops improving or the score target is reached.',
      optimizeMediumArticleDraftInput,
      async (args: any) => {
        try {
          const tags = parseOptionalJson<string[]>('tagsJson', args.tagsJson);
          return jsonContent(optimizeMediumArticleDraft({
            title: args.title,
            subtitle: args.subtitle,
            intro: args.intro,
            markdown: args.markdown,
            tags,
            seoTitle: args.seoTitle,
            seoDescription: args.seoDescription,
            hasCoverImage: args.hasCoverImage,
            audience: args.audience,
            maxPasses: args.maxPasses,
            minScore: args.minScore
          }));
        } catch (error: any) {
          return errorContent(`Error optimizing Medium article draft: ${error.message}`);
        }
      }
    );

    this.server.tool(
      'create-optimized-medium-rich-draft',
      'Optimize a rough markdown article package and immediately create a Medium legacy draft from the improved title, subtitle, and body.',
      createOptimizedMediumRichDraftInput,
      async (args: any) => {
        try {
          const tags = parseOptionalJson<string[]>('tagsJson', args.tagsJson);
          const draftBody = parseOptionalJson<Record<string, unknown>>('draftBodyJson', args.draftBodyJson);
          const optimized = optimizeMediumArticleDraft({
            title: args.title,
            subtitle: args.subtitle,
            intro: args.intro,
            markdown: args.markdown,
            tags,
            seoTitle: args.seoTitle,
            seoDescription: args.seoDescription,
            hasCoverImage: args.hasCoverImage,
            audience: args.audience,
            maxPasses: args.maxPasses,
            minScore: args.minScore
          });

          const draft = await this.mediumRichDraftWriter.createDraft({
            title: optimized.optimized.title,
            subtitle: optimized.optimized.subtitle,
            markdown: optimized.optimized.markdown,
            draftBody
          });

          return jsonContent({
            optimized,
            draft
          });
        } catch (error: any) {
          return errorContent(`Error creating optimized Medium rich draft: ${error.message}`);
        }
      }
    );

    this.server.tool(
      'publish-optimized-medium-draft',
      'Optimize a rough markdown article, create a Medium draft, apply metadata, publish it, and optionally optimize visibility and share settings.',
      publishOptimizedMediumDraftInput,
      async (args: any) => {
        try {
          const tagNames = parseOptionalJson<string[]>('tagNamesJson', args.tagNamesJson);
          const draftBody = parseOptionalJson<Record<string, unknown>>('draftBodyJson', args.draftBodyJson);
          return jsonContent(await this.mediumPostWorkflows.publishOptimizedDraft({
            title: args.title,
            subtitle: args.subtitle,
            intro: args.intro,
            markdown: args.markdown,
            tagNames,
            seoTitle: args.seoTitle,
            seoDescription: args.seoDescription,
            canonicalUrl: args.canonicalUrl,
            hasCoverImage: args.hasCoverImage,
            coverImagePath: args.coverImagePath,
            coverImageCaption: args.coverImageCaption,
            audience: args.audience,
            maxPasses: args.maxPasses,
            minScore: args.minScore,
            draftBody,
            optimizeVisibility: args.optimizeVisibility,
            createShareKey: args.createShareKey
          }));
        } catch (error: any) {
          return errorContent(`Error publishing optimized Medium draft: ${error.message}`);
        }
      }
    );

    this.server.tool(
      'probe-medium-session',
      'Verify that imported Medium cookies represent an authenticated web session without launching a browser.',
      {},
      async () => {
        try {
          return jsonContent(await this.mediumGraphqlClient.probeSession());
        } catch (error: any) {
          return errorContent(`Error probing Medium session: ${error.message}`);
        }
      }
    );

    this.server.tool(
      'medium-graphql-request',
      'Send an authenticated request to Medium\'s GraphQL endpoint using imported session cookies. Use raw bodyJson for persisted or captured editor operations.',
      mediumGraphqlRequestInput,
      async (args: any) => {
        try {
          const bodyFromJson = parseOptionalJson<Record<string, unknown>>('bodyJson', args.bodyJson);
          const variables = parseOptionalJson<Record<string, unknown>>('variablesJson', args.variablesJson);
          const extensions = parseOptionalJson<Record<string, unknown>>('extensionsJson', args.extensionsJson);
          const headers = parseOptionalJson<Record<string, string>>('headersJson', args.headersJson);

          const body = bodyFromJson || {
            ...(args.operationName ? { operationName: args.operationName } : {}),
            ...(args.query ? { query: args.query } : {}),
            ...(variables ? { variables } : {}),
            ...(extensions ? { extensions } : {})
          };

          return jsonContent(await this.mediumGraphqlClient.execute({
            body,
            endpoint: args.endpoint,
            headers,
            referer: args.referer,
            source: args.source
          }));
        } catch (error: any) {
          return errorContent(`Error executing Medium GraphQL request: ${error.message}`);
        }
      }
    );

    this.server.tool(
      'run-medium-graphql-operation',
      'Run a named Medium GraphQL operation from medium-operations.json or MEDIUM_GRAPHQL_OPERATIONS_FILE, with optional JSON overrides.',
      mediumRegisteredOperationInput,
      async (args: any) => {
        try {
          const body = parseOptionalJson<Record<string, unknown>>('bodyJson', args.bodyJson);
          const headers = parseOptionalJson<Record<string, string>>('headersJson', args.headersJson);

          return jsonContent(await this.mediumGraphqlClient.executeRegisteredOperation(args.alias, {
            body,
            endpoint: args.endpoint,
            headers,
            referer: args.referer,
            source: args.source
          }));
        } catch (error: any) {
          return errorContent(`Error running registered Medium GraphQL operation: ${error.message}`);
        }
      }
    );

    this.server.tool(
      'discover-medium-graphql',
      'Inspect the authenticated Medium writer surface, extract the GraphQL endpoint, fetch live lite bundles, and recover embedded operation documents.',
      discoverMediumGraphqlInput,
      async (args: any) => {
        try {
          return jsonContent(
            await this.mediumGraphqlDiscovery.inspectWriterSurface({
              maxBundles: args.maxBundles,
              operationName: args.operationName,
              pageUrl: args.pageUrl
            })
          );
        } catch (error: any) {
          return errorContent(`Error discovering Medium GraphQL surface: ${error.message}`);
        }
      }
    );

    this.server.tool(
      'capture-medium-graphql-operations',
      'Discover a Medium lite page, capture named GraphQL operations into registry format, and optionally write them to a local operations file.',
      captureMediumGraphqlOperationsInput,
      async (args: any) => {
        try {
          const aliasMap = parseOptionalJson<Record<string, string>>('aliasesJson', args.aliasesJson) || {};
          if (!Object.keys(aliasMap).length) {
            throw new Error('aliasesJson must map at least one alias name to an operation name.');
          }

          const discovery = await this.mediumGraphqlDiscovery.inspectWriterSurface({
            maxBundles: args.maxBundles,
            pageUrl: args.pageUrl
          });

          const source = args.source || 'codex-medium-mcp';
          const captured = buildOperationRegistryDocument(discovery, aliasMap, source);

          if (args.outputFile) {
            const outputPath = args.outputFile;
            let nextDocument = captured;

            if (args.merge && fs.existsSync(outputPath)) {
              const existing = JSON.parse(fs.readFileSync(outputPath, 'utf-8')) as Partial<MediumGraphqlRegistryDocument>;
              nextDocument = {
                operations: {
                  ...(existing.operations || {}),
                  ...captured.operations
                }
              };
            }

            fs.writeFileSync(outputPath, JSON.stringify(nextDocument, null, 2), 'utf-8');
            return jsonContent({
              ...captured,
              outputFile: outputPath,
              pageUrl: discovery.finalUrl
            });
          }

          return jsonContent({
            ...captured,
            pageUrl: discovery.finalUrl
          });
        } catch (error: any) {
          return errorContent(`Error capturing Medium GraphQL operations: ${error.message}`);
        }
      }
    );

    this.server.tool(
      'medium-legacy-request',
      'Send an authenticated request to Medium\'s legacy editor/internal JSON endpoints using imported session cookies. Use this for observed non-GraphQL routes such as /new-story, /p/{postId}/deltas, and /_/api/posts/{postId}/draft.',
      mediumLegacyRequestInput,
      async (args: any) => {
        try {
          const body = parseOptionalJson<unknown>('bodyJson', args.bodyJson);
          const headers = parseOptionalJson<Record<string, string>>('headersJson', args.headersJson);
          const query = parseOptionalJson<Record<string, boolean | number | string>>('queryJson', args.queryJson);

          return jsonContent(await this.mediumLegacyEditorClient.request({
            method: args.method,
            path: args.path,
            query,
            body,
            headers,
            referer: args.referer,
            accept: args.accept,
            contentType: args.contentType
          }));
        } catch (error: any) {
          return errorContent(`Error executing Medium legacy request: ${error.message}`);
        }
      }
    );

    this.server.tool(
      'create-medium-legacy-draft',
      'Create or reopen the current legacy Medium draft shell through the private /new-story endpoint.',
      createMediumLegacyDraftInput,
      async (args: any) => {
        try {
          const body = parseOptionalJson<Record<string, unknown>>('bodyJson', args.bodyJson);
          return jsonContent(await this.mediumLegacyEditorClient.createDraft(body));
        } catch (error: any) {
          return errorContent(`Error creating Medium legacy draft: ${error.message}`);
        }
      }
    );

    this.server.tool(
      'get-medium-legacy-draft',
      'Fetch the legacy Medium draft payload from /_/api/posts/{postId}/draft.',
      mediumLegacyPostIdInput,
      async (args: any) => {
        try {
          return jsonContent(await this.mediumLegacyEditorClient.getDraft(args.postId));
        } catch (error: any) {
          return errorContent(`Error retrieving Medium legacy draft: ${error.message}`);
        }
      }
    );

    this.server.tool(
      'get-medium-legacy-post',
      'Fetch the legacy Medium post payload from /_/api/posts/{postId}. This exposes the older bodyModel shape used by the editor shell.',
      mediumLegacyPostIdInput,
      async (args: any) => {
        try {
          return jsonContent(await this.mediumLegacyEditorClient.getPost(args.postId));
        } catch (error: any) {
          return errorContent(`Error retrieving Medium legacy post: ${error.message}`);
        }
      }
    );

    this.server.tool(
      'get-medium-legacy-deltas',
      'Fetch legacy Medium editor deltas from /p/{postId}/deltas for a specific base revision.',
      mediumLegacyDeltasInput,
      async (args: any) => {
        try {
          return jsonContent(await this.mediumLegacyEditorClient.getDeltas(args.postId, args.baseRev));
        } catch (error: any) {
          return errorContent(`Error retrieving Medium legacy deltas: ${error.message}`);
        }
      }
    );

    this.server.tool(
      'get-medium-legacy-edit-state',
      'Fetch the legacy Medium /p/{postId}/edit JSON state using XHR-style headers instead of the browser shell.',
      mediumLegacyPostIdInput,
      async (args: any) => {
        try {
          return jsonContent(await this.mediumLegacyEditorClient.getEditState(args.postId));
        } catch (error: any) {
          return errorContent(`Error retrieving Medium legacy edit state: ${error.message}`);
        }
      }
    );

    this.server.tool(
      'apply-medium-legacy-deltas',
      'Replay a captured legacy Medium body-editor delta request against /p/{postId}/deltas. Use only with observed delta payloads; the exact schema is not publicly documented.',
      mediumLegacyApplyDeltasInput,
      async (args: any) => {
        try {
          const deltas = parseOptionalJson<unknown>('deltasJson', args.deltasJson);
          const extraBody = parseOptionalJson<Record<string, unknown>>('extraBodyJson', args.extraBodyJson);
          return jsonContent(await this.mediumLegacyEditorClient.applyDeltas(args.postId, args.baseRev, deltas, extraBody));
        } catch (error: any) {
          return errorContent(`Error applying Medium legacy deltas: ${error.message}`);
        }
      }
    );

    this.server.tool(
      'write-medium-rich-draft',
      'Write a Medium draft through the legacy delta editor using title/subtitle plus markdown or explicit block definitions. This uses the same private body-editor path that Medium’s older editor shell still relies on.',
      mediumWriteRichDraftInput,
      async (args: any) => {
        try {
          const blocks = parseOptionalJson<MediumRichDraftBlock[]>('blocksJson', args.blocksJson);
          return jsonContent(await this.mediumRichDraftWriter.writeDraft({
            postId: args.postId,
            title: args.title,
            subtitle: args.subtitle,
            markdown: args.markdown,
            blocks,
            append: args.append
          }));
        } catch (error: any) {
          return errorContent(`Error writing Medium rich draft: ${error.message}`);
        }
      }
    );

    this.server.tool(
      'create-medium-rich-draft',
      'Create or reopen the current Medium legacy draft and populate it with title/subtitle plus markdown or explicit block definitions.',
      mediumRichDraftInput,
      async (args: any) => {
        try {
          const blocks = parseOptionalJson<MediumRichDraftBlock[]>('blocksJson', args.blocksJson);
          const draftBody = parseOptionalJson<Record<string, unknown>>('draftBodyJson', args.draftBodyJson);
          return jsonContent(await this.mediumRichDraftWriter.createDraft({
            title: args.title,
            subtitle: args.subtitle,
            markdown: args.markdown,
            blocks,
            append: args.append,
            draftBody
          }));
        } catch (error: any) {
          return errorContent(`Error creating Medium rich draft: ${error.message}`);
        }
      }
    );

    this.server.tool(
      'create-gist-legacy-draft',
      'Prepare a Medium-oriented article from a GitHub Gist and write it into the legacy Medium body editor through observed delta operations.',
      createGistLegacyDraftInput,
      async (args: any) => {
        try {
          const prepared = await this.gistClient.prepareMediumDraft(args.gist, args);
          const draft = await this.mediumRichDraftWriter.createDraft({
            title: prepared.mediumTitle,
            subtitle: args.subtitle || prepared.mediumSubtitle,
            markdown: prepared.mediumBodyMarkdown,
            append: args.append
          });

          return jsonContent({
            prepared,
            draft
          });
        } catch (error: any) {
          return errorContent(`Error creating gist-based Medium legacy draft: ${error.message}`);
        }
      }
    );

    this.server.tool(
      'create-github-repo-legacy-draft',
      'Prepare a Medium-oriented article from a GitHub repository and write it into the legacy Medium body editor through observed delta operations.',
      createGitHubRepoLegacyDraftInput,
      async (args: any) => {
        try {
          const prepared = await this.gitHubRepoClient.prepareMediumDraft(args.repo, args);
          const draft = await this.mediumRichDraftWriter.createDraft({
            title: prepared.mediumTitle,
            subtitle: args.subtitle || prepared.mediumSubtitle,
            markdown: prepared.mediumBodyMarkdown,
            append: args.append
          });

          return jsonContent({
            prepared,
            draft
          });
        } catch (error: any) {
          return errorContent(`Error creating GitHub repo-based Medium legacy draft: ${error.message}`);
        }
      }
    );

    this.server.tool(
      'inspect-medium-post-state',
      'Inspect a Medium post across private draft state and public page metadata, then report likely issues such as subtitle breakage, weak title/subtitle packaging, missing cover image, canonical drift, or imported-date lock.',
      inspectMediumPostInput,
      async (args: any) => {
        try {
          return jsonContent(await this.mediumPostWorkflows.inspectPostState({
            postId: args.postId,
            publicUrl: args.publicUrl
          }));
        } catch (error: any) {
          return errorContent(`Error inspecting Medium post state: ${error.message}`);
        }
      }
    );

    this.server.tool(
      'optimize-medium-post',
      'Optimize a live Medium post in place by syncing title, subtitle, SEO metadata, canonical URL, and optional tags, then verify the resulting public metadata. Set autoRewritePackage=true to let the tool generate a stronger package before applying it.',
      optimizeMediumPostInput,
      async (args: any) => {
        try {
          const tagNames = parseOptionalJson<string[]>('tagNamesJson', args.tagNamesJson);
          return jsonContent(await this.mediumPostWorkflows.optimizeExistingPost({
            postId: args.postId,
            autoRewritePackage: args.autoRewritePackage,
            title: args.title,
            subtitle: args.subtitle,
            intro: args.intro,
            seoTitle: args.seoTitle,
            seoDescription: args.seoDescription,
            canonicalUrl: args.canonicalUrl,
            coverImagePath: args.coverImagePath,
            coverImageCaption: args.coverImageCaption,
            tagNames
          }));
        } catch (error: any) {
          return errorContent(`Error optimizing Medium post: ${error.message}`);
        }
      }
    );

    this.server.tool(
      'optimize-medium-visibility',
      'Inspect and optimize verified Medium reach/distribution settings such as response permissions, publish-flow defaults, and share/distribution primitives.',
      optimizeMediumVisibilityInput,
      async (args: any) => {
        try {
          return jsonContent(await this.mediumPostWorkflows.optimizeVisibility({
            postId: args.postId,
            enableResponses: args.enableResponses,
            ensurePublishingFlowDefaults: args.ensurePublishingFlowDefaults,
            createShareKey: args.createShareKey
          }));
        } catch (error: any) {
          return errorContent(`Error optimizing Medium visibility: ${error.message}`);
        }
      }
    );

    this.server.tool(
      'clone-medium-post-to-fresh-post',
      'Clone an existing Medium post into a fresh post using the legacy body-editor model, then optionally publish it with updated tags, SEO, subtitle, and canonical URL.',
      cloneMediumPostInput,
      async (args: any) => {
        try {
          const tagNames = parseOptionalJson<string[]>('tagNamesJson', args.tagNamesJson);
          const draftBody = parseOptionalJson<Record<string, unknown>>('draftBodyJson', args.draftBodyJson);
          return jsonContent(await this.mediumPostWorkflows.clonePostToFreshPost({
            postId: args.postId,
            title: args.title,
            subtitle: args.subtitle,
            tagNames,
            seoTitle: args.seoTitle,
            seoDescription: args.seoDescription,
            canonicalUrl: args.canonicalUrl,
            publish: args.publish,
            draftBody
          }));
        } catch (error: any) {
          return errorContent(`Error cloning Medium post: ${error.message}`);
        }
      }
    );

    this.server.tool(
      'replace-imported-medium-post',
      'Create a fresh current-dated replacement for an imported Medium post, then optionally convert the original URL into a historical stub that points readers to the new post.',
      replaceImportedMediumPostInput,
      async (args: any) => {
        try {
          const tagNames = parseOptionalJson<string[]>('tagNamesJson', args.tagNamesJson);
          const draftBody = parseOptionalJson<Record<string, unknown>>('draftBodyJson', args.draftBodyJson);
          return jsonContent(await this.mediumPostWorkflows.replaceImportedPost({
            postId: args.postId,
            title: args.title,
            subtitle: args.subtitle,
            tagNames,
            seoTitle: args.seoTitle,
            seoDescription: args.seoDescription,
            canonicalUrl: args.canonicalUrl,
            publish: args.publish,
            draftBody,
            convertOriginalToHistoricalStub: args.convertOriginalToHistoricalStub,
            historicalTitle: args.historicalTitle,
            historicalSubtitle: args.historicalSubtitle,
            historicalIntro: args.historicalIntro,
            historicalSeoTitle: args.historicalSeoTitle,
            historicalSeoDescription: args.historicalSeoDescription
          }));
        } catch (error: any) {
          return errorContent(`Error replacing imported Medium post: ${error.message}`);
        }
      }
    );

    this.server.tool(
      'create-medium-share-key',
      'Create a Medium share key for a published post so a caller can push distribution workflows without reconstructing the private GraphQL call manually.',
      mediumLegacyPostIdInput,
      async (args: any) => {
        try {
          return jsonContent(await this.mediumPostWorkflows.createShareKey(args.postId));
        } catch (error: any) {
          return errorContent(`Error creating Medium share key: ${error.message}`);
        }
      }
    );

    this.server.tool(
      'delete-medium-post',
      'Move a Medium draft or published post to trash using the live writer GraphQL delete mutation.',
      mediumPostIdInput,
      async (args: any) => {
        try {
          return jsonContent(await this.mediumPostWorkflows.deletePost(args.postId));
        } catch (error: any) {
          return errorContent(`Error deleting Medium post: ${error.message}`);
        }
      }
    );

    this.server.tool(
      'undelete-medium-post',
      'Restore a Medium post from trash using the live writer GraphQL undelete mutation.',
      mediumPostIdInput,
      async (args: any) => {
        try {
          return jsonContent(await this.mediumPostWorkflows.undeletePost(args.postId));
        } catch (error: any) {
          return errorContent(`Error undeleting Medium post: ${error.message}`);
        }
      }
    );

    this.server.tool(
      'verify-medium-web-session',
      'Verify that the browser-backed Medium session is authenticated. Supports either a CDP endpoint or imported cookies.',
      {},
      async () => {
        try {
          return jsonContent(await this.mediumWebClient.verifySession());
        } catch (error: any) {
          return errorContent(`Error verifying Medium web session: ${error.message}`);
        }
      }
    );

    this.server.tool(
      'create-web-draft',
      'Create a Medium draft in the real Medium editor by pasting rich HTML or markdown-converted content into the UI.',
      createWebDraftInput,
      async (args: any) => {
        try {
          if (!args.contentMarkdown && !args.contentHtml) {
            throw new Error('Provide either contentMarkdown or contentHtml.');
          }

          return jsonContent(await this.mediumWebClient.createDraft(args));
        } catch (error: any) {
          return errorContent(`Error creating Medium web draft: ${error.message}`);
        }
      }
    );

    this.server.tool(
      'create-gist-web-draft',
      'Prepare a polished Medium draft from a GitHub Gist and open it inside the real Medium editor.',
      createGistWebDraftInput,
      async (args: any) => {
        try {
          const prepared = await this.gistClient.prepareMediumDraft(args.gist, args);
          const draft = await this.mediumWebClient.createDraft({
            title: prepared.mediumTitle,
            subtitle: args.subtitle || prepared.mediumSubtitle,
            contentMarkdown: prepared.mediumBodyMarkdown
          });

          return jsonContent({
            prepared,
            draft
          });
        } catch (error: any) {
          return errorContent(`Error creating gist-based Medium draft: ${error.message}`);
        }
      }
    );
  }

  private registerExperimentalTools() {
    this.server.tool(
      'update-article',
      'Experimental Medium tool. This endpoint is not documented in Medium’s archived API docs.',
      updateArticleInput,
      async (args: any) => {
        try {
          await this.auth.authenticate();
          return jsonContent(await this.mediumClient.updateArticle(args));
        } catch (error: any) {
          return errorContent(`Error updating article: ${error.message}`);
        }
      }
    );

    this.server.tool(
      'delete-article',
      'Experimental Medium tool. This endpoint is not documented in Medium’s archived API docs.',
      articleIdInput,
      async (args: any) => {
        try {
          await this.auth.authenticate();
          return jsonContent(await this.mediumClient.deleteArticle(args.articleId));
        } catch (error: any) {
          return errorContent(`Error deleting article: ${error.message}`);
        }
      }
    );

    this.server.tool(
      'get-article',
      'Experimental Medium tool. This endpoint is not documented in Medium’s archived API docs.',
      articleIdInput,
      async (args: any) => {
        try {
          await this.auth.authenticate();
          return jsonContent(await this.mediumClient.getArticle(args.articleId));
        } catch (error: any) {
          return errorContent(`Error retrieving article: ${error.message}`);
        }
      }
    );

    this.server.tool(
      'get-drafts',
      'Experimental Medium tool. This endpoint is not documented in Medium’s archived API docs.',
      {},
      async () => {
        try {
          await this.auth.authenticate();
          return jsonContent(await this.mediumClient.getDrafts());
        } catch (error: any) {
          return errorContent(`Error retrieving drafts: ${error.message}`);
        }
      }
    );

    this.server.tool(
      'search-articles',
      'Experimental Medium tool. This endpoint is not documented in Medium’s archived API docs.',
      searchArticlesInput,
      async (args: any) => {
        try {
          await this.auth.authenticate();
          return jsonContent(await this.mediumClient.searchArticles(args));
        } catch (error: any) {
          return errorContent(`Error searching articles: ${error.message}`);
        }
      }
    );
  }

  private registerTools() {
    this.registerSupportedTools();

    if (process.env.MEDIUM_ENABLE_EXPERIMENTAL_TOOLS === 'true') {
      this.registerExperimentalTools();
    }
  }

  async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Medium MCP server initialized');
  }
}

async function main() {
  const server = new MediumMcpServer();
  await server.start();
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
