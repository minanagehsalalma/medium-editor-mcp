import MediumGraphqlClient from './medium-graphql';
import MediumLegacyEditorClient, { MediumLegacyResponse } from './medium-legacy-editor';
import { assessMediumPostAppeal } from './medium-content-strategy';
import { optimizeMediumDraftPackage } from './medium-draft-optimizer';
import { optimizeMediumArticleDraft } from './medium-article-optimizer';
import MediumRichDraftWriter from './medium-rich-draft';

export interface CloneMediumPostInput {
  canonicalUrl?: string;
  draftBody?: Record<string, unknown>;
  postId: string;
  publish?: boolean;
  seoDescription?: string;
  seoTitle?: string;
  subtitle?: string;
  tagNames?: string[];
  title?: string;
}

export interface ReplaceImportedMediumPostInput extends CloneMediumPostInput {
  convertOriginalToHistoricalStub?: boolean;
  historicalIntro?: string;
  historicalSeoDescription?: string;
  historicalSeoTitle?: string;
  historicalSubtitle?: string;
  historicalTitle?: string;
}

export interface InspectMediumPostInput {
  postId: string;
  publicUrl?: string;
}

export interface OptimizeMediumPostInput {
  autoRewritePackage?: boolean;
  canonicalUrl?: string;
  coverImageCaption?: string;
  coverImagePath?: string;
  intro?: string;
  postId: string;
  seoDescription?: string;
  seoTitle?: string;
  subtitle?: string;
  tagNames?: string[];
  title?: string;
}

export interface OptimizeMediumVisibilityInput {
  createShareKey?: boolean;
  enableResponses?: boolean;
  ensurePublishingFlowDefaults?: boolean;
  postId: string;
}

export interface DeleteMediumPostResult {
  deleted: boolean;
  postId: string;
  response: unknown;
}

export interface UndeleteMediumPostResult {
  postId: string;
  response: unknown;
  undeleted: boolean;
}

export interface TestMediumWritePathInput {
  draftBody?: Record<string, unknown>;
  markdown?: string;
  subtitle?: string;
  title?: string;
}

export interface PublishOptimizedMediumDraftInput {
  audience?: string;
  canonicalUrl?: string;
  coverImageCaption?: string;
  coverImagePath?: string;
  createShareKey?: boolean;
  draftBody?: Record<string, unknown>;
  hasCoverImage?: boolean;
  intro?: string;
  markdown: string;
  maxPasses?: number;
  minScore?: number;
  optimizeVisibility?: boolean;
  seoDescription?: string;
  seoTitle?: string;
  subtitle?: string;
  tagNames?: string[];
  title: string;
}

interface MediumParagraph {
  markups?: unknown[];
  metadata?: Record<string, unknown>;
  name?: string;
  text?: string;
  type?: number;
  [key: string]: unknown;
}

interface MediumPostValue {
  content?: {
    postDisplay?: {
      coverless?: boolean;
    };
    bodyModel?: {
      paragraphs?: MediumParagraph[];
    };
  };
  allowResponses?: boolean;
  importedPublishedAt?: number;
  importedUrl?: string;
  firstPublishedAt?: number;
  hasUnpublishedEdits?: boolean;
  isLocked?: boolean;
  latestPublishedAt?: number;
  latestRev?: number;
  mediumUrl?: string;
  previewImage?: Record<string, unknown> | null;
  previewContent?: {
    subtitle?: string;
  };
  virtuals?: {
    imageCount?: number;
    previewImage?: {
      imageId?: string;
      originalHeight?: number;
      originalWidth?: number;
    } | null;
  };
  responseDistribution?: unknown;
  title?: string;
  uniqueSlug?: string;
  visibility?: unknown;
}

interface MediumGraphqlPostState {
  curationEligibleAt?: unknown;
  id?: string;
  isLocked?: boolean;
  isMarkedPaywallOnly?: boolean;
  isNewsletter?: boolean;
  isPublishToEmail?: boolean;
  responseDistribution?: unknown;
  visibility?: unknown;
}

interface MediumPublicMetadata {
  articlePublishedTime: string | null;
  canonicalUrl: string | null;
  description: string | null;
  isCloudflareChallenge: boolean;
  ogDescription: string | null;
  ogTitle: string | null;
  titleTag: string | null;
  url: string;
}

interface UpdatedFrontMatterResult {
  applyResponse: MediumLegacyResponse | null;
  finalDraft: MediumLegacyResponse;
  finalPost: MediumLegacyResponse;
  metadataResponses: Record<string, unknown>;
  publishResponse: MediumLegacyResponse;
}

function parsePayloadValue(response: MediumLegacyResponse): MediumPostValue {
  return ((response.data as any)?.payload?.value || {}) as MediumPostValue;
}

function parseNormalizingDeltas(response: MediumLegacyResponse): unknown[] {
  const payload = (response.data as any)?.payload || {};
  return Array.isArray(payload.normalizingDeltas) ? payload.normalizingDeltas : [];
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function decodeHtmlEntities(value: string | null): string | null {
  if (!value) {
    return value;
  }

  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function truncateSentence(value: string, maxLength: number) {
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function extractPublicMetadata(url: string, html: string): MediumPublicMetadata {
  const readMeta = (pattern: RegExp) => {
    const match = html.match(pattern);
    return decodeHtmlEntities(match?.[1] || null);
  };

  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);

  return {
    url,
    titleTag: decodeHtmlEntities(titleMatch?.[1] || null),
    ogTitle: readMeta(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i),
    description: readMeta(/<meta[^>]+name="description"[^>]+content="([^"]+)"/i),
    ogDescription: readMeta(/<meta[^>]+property="og:description"[^>]+content="([^"]+)"/i),
    canonicalUrl: readMeta(/<link[^>]+rel="canonical"[^>]+href="([^"]+)"/i),
    articlePublishedTime: readMeta(/<meta[^>]+property="article:published_time"[^>]+content="([^"]+)"/i),
    isCloudflareChallenge: /Just a moment/i.test(html)
  };
}

function findTitleParagraphIndex(paragraphs: MediumParagraph[]): number {
  const titledIndex = paragraphs.findIndex((paragraph) => paragraph.type === 3 && typeof paragraph.text === 'string');
  if (titledIndex >= 0) {
    return titledIndex;
  }

  return paragraphs.findIndex((paragraph) => typeof paragraph.text === 'string' && paragraph.text.trim().length > 0);
}

function findIntroParagraphIndex(paragraphs: MediumParagraph[], titleIndex: number): number {
  for (let index = Math.max(titleIndex + 1, 0); index < paragraphs.length; index += 1) {
    const paragraph = paragraphs[index];
    if (paragraph.type === 4) {
      continue;
    }

    if (typeof paragraph.text === 'string' && paragraph.text.trim().length > 0) {
      return index;
    }
  }

  return -1;
}

function hasImageMetadata(paragraph?: MediumParagraph | null) {
  return Boolean(paragraph?.metadata && typeof paragraph.metadata.id === 'string' && paragraph.metadata.id.trim().length > 0);
}

function buildParagraphName(prefix: string) {
  return `${prefix}${Math.random().toString(16).slice(2, 6)}`;
}

function extractIntroParagraphText(postValue: MediumPostValue): string | undefined {
  const paragraphs = postValue.content?.bodyModel?.paragraphs || [];
  const titleIndex = findTitleParagraphIndex(paragraphs);
  const introIndex = findIntroParagraphIndex(paragraphs, titleIndex);
  if (introIndex < 0) {
    return undefined;
  }

  const introText = paragraphs[introIndex]?.text;
  if (typeof introText !== 'string' || !introText.trim()) {
    return undefined;
  }

  return truncateSentence(introText, 240);
}

function buildHistoricalTitle(year: string, sourceTitle: string | null) {
  if (!sourceTitle) {
    return `Original ${year} Medium Post`;
  }

  if (/^Original\s+\d{4}\s+Medium Post:/i.test(sourceTitle)) {
    return sourceTitle;
  }

  return `Original ${year} Medium Post: ${sourceTitle}`;
}

class MediumPostWorkflows {
  constructor(
    private legacyClient: MediumLegacyEditorClient,
    private graphqlClient: MediumGraphqlClient,
    private richDraftWriter: MediumRichDraftWriter = new MediumRichDraftWriter(legacyClient)
  ) {}

  private async ensureInitializedDraft(postId: string) {
    const draft = await this.legacyClient.getDraft(postId);
    const draftValue = parsePayloadValue(draft);
    const latestRev = typeof draftValue.latestRev === 'number' ? draftValue.latestRev : null;
    const normalizingDeltas = parseNormalizingDeltas(draft);

    if (latestRev !== null && latestRev < 0 && normalizingDeltas.length) {
      await this.legacyClient.applyDeltas(postId, latestRev, normalizingDeltas);
    }

    return this.legacyClient.getPost(postId);
  }

  private postHasCoverImage(postValue: MediumPostValue) {
    const bodyParagraphs = postValue.content?.bodyModel?.paragraphs || [];
    const bodyHasImage = bodyParagraphs.some((paragraph) => hasImageMetadata(paragraph));
    const topLevelPreview = Boolean(postValue.previewImage && Object.keys(postValue.previewImage).length > 0);
    const virtualPreview = Boolean(postValue.virtuals?.previewImage?.imageId);
    const virtualImageCount = typeof postValue.virtuals?.imageCount === 'number' && postValue.virtuals.imageCount > 0;
    return bodyHasImage || topLevelPreview || virtualPreview || virtualImageCount;
  }

  private async attachCoverImage(postId: string, imagePath: string, caption?: string) {
    const initializedPost = await this.ensureInitializedDraft(postId);
    const postValue = parsePayloadValue(initializedPost);
    const baseRev = typeof postValue.latestRev === 'number' ? postValue.latestRev : 0;
    const paragraphs = cloneJson(postValue.content?.bodyModel?.paragraphs || []);
    const titleIndex = findTitleParagraphIndex(paragraphs);
    const coverIndex = Math.max(titleIndex + 1, 0);
    const uploadResponse = await this.legacyClient.uploadImage(imagePath, {
      is2x: true,
      referer: `https://medium.com/p/${postId}/edit`
    });
    const uploadValue = (((uploadResponse.data as any)?.payload?.value) || {}) as {
      fileId?: string;
      imgHeight?: number;
      imgWidth?: number;
    };

    if (!uploadValue.fileId || !uploadValue.imgWidth || !uploadValue.imgHeight) {
      throw new Error('Medium image upload did not return fileId/imgWidth/imgHeight.');
    }

    const paragraph = {
      name: hasImageMetadata(paragraphs[coverIndex]) ? paragraphs[coverIndex].name || buildParagraphName('cov') : buildParagraphName('cov'),
      type: 4,
      text: caption?.trim() || '',
      markups: [],
      layout: 1,
      metadata: {
        id: uploadValue.fileId,
        originalWidth: uploadValue.imgWidth,
        originalHeight: uploadValue.imgHeight
      }
    };

    const delta = hasImageMetadata(paragraphs[coverIndex])
      ? {
          type: 3,
          index: coverIndex,
          paragraph,
          verifySameName: Boolean(paragraph.name)
        }
      : {
          type: 1,
          index: coverIndex,
          paragraph
        };

    const applyResponse = await this.legacyClient.applyDeltas(postId, baseRev, [delta]);

    return {
      uploadResponse,
      applyResponse,
      paragraph,
      insertIndex: coverIndex
    };
  }

  private async applyOptionalGraphqlMetadata(
    postId: string,
    options: {
      canonicalUrl?: string;
      seoDescription?: string;
      seoTitle?: string;
      subtitle?: string;
      tagNames?: string[];
    }
  ) {
    const actions: Record<string, unknown> = {};

    if (options.subtitle?.trim()) {
      actions.stageUpdatePostMetadata = await this.graphqlClient.executeRegisteredOperation('stage-update-post-metadata', {
        body: {
          variables: {
            input: {
              targetPostId: postId,
              subtitle: options.subtitle.trim()
            }
          }
        }
      });
    }

    if (options.tagNames?.length) {
      actions.setPostTags = await this.graphqlClient.executeRegisteredOperation('set-post-tags', {
        body: {
          variables: {
            targetPostId: postId,
            tagNames: options.tagNames
          }
        }
      });
    }

    if (options.seoTitle?.trim()) {
      actions.setPostSeoTitle = await this.graphqlClient.executeRegisteredOperation('set-post-seo-title', {
        body: {
          variables: {
            targetPostId: postId,
            seoTitle: options.seoTitle.trim()
          }
        }
      });
    }

    if (options.seoDescription?.trim()) {
      actions.setPostSeoDescription = await this.graphqlClient.executeRegisteredOperation('set-post-seo-description', {
        body: {
          variables: {
            targetPostId: postId,
            seoDescription: options.seoDescription.trim()
          }
        }
      });
    }

    if (options.canonicalUrl?.trim()) {
      actions.updateCanonicalUrl = await this.graphqlClient.executeRegisteredOperation('update-canonical-url', {
        body: {
          variables: {
            input: {
              postId,
              url: options.canonicalUrl.trim()
            }
          }
        }
      });
    }

    return actions;
  }

  private deriveSubtitleFromPost(postValue: MediumPostValue): string | undefined {
    const existingSubtitle = postValue.previewContent?.subtitle?.trim();
    if (existingSubtitle && existingSubtitle !== 'x') {
      return existingSubtitle;
    }

    const introText = extractIntroParagraphText(postValue);
    if (!introText) {
      return undefined;
    }

    return truncateSentence(introText, 160);
  }

  private deriveSeoDescription(postValue: MediumPostValue, subtitle?: string): string | undefined {
    const cleanedSubtitle = subtitle?.trim();
    if (cleanedSubtitle) {
      return truncateSentence(cleanedSubtitle, 160);
    }

    const introText = extractIntroParagraphText(postValue);
    if (introText) {
      return truncateSentence(introText, 160);
    }

    return undefined;
  }

  private async fetchPublicMetadata(url: string): Promise<MediumPublicMetadata> {
    const response = await this.graphqlClient.fetchText(url, url);
    return extractPublicMetadata(response.finalUrl || url, response.data);
  }

  private async fetchGraphqlPostSettings(postId: string): Promise<MediumGraphqlPostState> {
    const response = await this.graphqlClient.executeRegisteredOperation('post-settings', {
      body: {
        variables: {
          postId
        }
      }
    });

    return (((response.data as any)?.data?.postResult) || {}) as MediumGraphqlPostState;
  }

  private async fetchPublishDialogState(postId: string): Promise<MediumGraphqlPostState> {
    const response = await this.graphqlClient.executeRegisteredOperation('post-published-dialog', {
      body: {
        variables: {
          postId
        }
      }
    });

    return (((response.data as any)?.data?.post) || {}) as MediumGraphqlPostState;
  }

  private async updateExistingPostFrontMatter(input: {
    canonicalUrl?: string;
    intro?: string;
    postId: string;
    seoDescription?: string;
    seoTitle?: string;
    subtitle?: string;
    title?: string;
  }): Promise<UpdatedFrontMatterResult> {
    const initializedPost = await this.ensureInitializedDraft(input.postId);
    const postValue = parsePayloadValue(initializedPost);
    const baseRev = typeof postValue.latestRev === 'number' ? postValue.latestRev : 0;
    const paragraphs = cloneJson(postValue.content?.bodyModel?.paragraphs || []);
    const deltas: Array<Record<string, unknown>> = [];

    const titleIndex = findTitleParagraphIndex(paragraphs);
    if (input.title?.trim() && titleIndex >= 0) {
      const titleParagraph = cloneJson(paragraphs[titleIndex]);
      titleParagraph.text = input.title.trim();
      deltas.push({
        type: 3,
        index: titleIndex,
        paragraph: titleParagraph,
        verifySameName: Boolean(titleParagraph.name)
      });
    }

    const introIndex = findIntroParagraphIndex(paragraphs, titleIndex);
    if (input.intro?.trim() && introIndex >= 0) {
      const introParagraph = cloneJson(paragraphs[introIndex]);
      introParagraph.text = input.intro.trim();
      deltas.push({
        type: 3,
        index: introIndex,
        paragraph: introParagraph,
        verifySameName: Boolean(introParagraph.name)
      });
    }

    if (input.subtitle?.trim()) {
      deltas.push({
        type: 5,
        text: input.subtitle.trim()
      });
    }

    const applyResponse = deltas.length
      ? await this.legacyClient.applyDeltas(input.postId, baseRev, deltas)
      : null;

    const metadataResponses = await this.applyOptionalGraphqlMetadata(input.postId, {
      canonicalUrl: input.canonicalUrl,
      seoDescription: input.seoDescription,
      seoTitle: input.seoTitle,
      subtitle: input.subtitle
    });

    const publishResponse = await this.legacyClient.publishPost(input.postId);
    const finalPost = await this.legacyClient.getPost(input.postId);
    const finalDraft = await this.legacyClient.getDraft(input.postId);

    return {
      applyResponse,
      metadataResponses,
      publishResponse,
      finalPost,
      finalDraft
    };
  }

  public async inspectPostState(input: InspectMediumPostInput) {
    const post = await this.legacyClient.getPost(input.postId);
    const draft = await this.legacyClient.getDraft(input.postId);
    const settingsState = await this.fetchGraphqlPostSettings(input.postId);
    const publishDialogState = await this.fetchPublishDialogState(input.postId);
    const postValue = parsePayloadValue(post);
    const draftValue = parsePayloadValue(draft);
    const publicUrl = input.publicUrl?.trim() || postValue.mediumUrl || null;
    const publicMetadata = publicUrl ? await this.fetchPublicMetadata(publicUrl) : null;
    const introText = extractIntroParagraphText(draftValue);
    const subtitle = this.deriveSubtitleFromPost(draftValue);
    const seoDescription = this.deriveSeoDescription(draftValue, subtitle);
    const appealAssessment = assessMediumPostAppeal({
      title: postValue.title || null,
      subtitle: draftValue.previewContent?.subtitle || subtitle || null,
      intro: introText || null,
      publicDescription: publicMetadata?.description || publicMetadata?.ogDescription || null,
      hasPreviewImage: this.postHasCoverImage(postValue)
    });
    const issues: Array<{ code: string; severity: 'info' | 'warning'; message: string; recommendedAction: string }> = [];

    if (!publicUrl) {
      issues.push({
        code: 'missing_public_url',
        severity: 'warning',
        message: 'The post payload does not expose a public Medium URL.',
        recommendedAction: 'Publish the post or fetch it again after publication before attempting public-page verification.'
      });
    }

    if (publicMetadata?.isCloudflareChallenge) {
      issues.push({
        code: 'cloudflare_challenge',
        severity: 'warning',
        message: 'The public fetch hit a Cloudflare challenge, so public metadata could not be verified fully.',
        recommendedAction: 'Retry later or verify the public page through a browser-backed session.'
      });
    }

    if (draftValue.previewContent?.subtitle === 'x') {
      issues.push({
        code: 'broken_subtitle_probe_artifact',
        severity: 'warning',
        message: 'The draft subtitle is literally "x", which is a common artifact of schema probing.',
        recommendedAction: 'Run optimize-medium-post or set a real subtitle explicitly.'
      });
    }

    if (!draftValue.previewContent?.subtitle?.trim()) {
      issues.push({
        code: 'missing_subtitle',
        severity: 'warning',
        message: 'The post does not currently expose a preview subtitle.',
        recommendedAction: 'Run optimize-medium-post to synthesize a subtitle from the intro paragraph.'
      });
    }

    if (publicMetadata && postValue.title && publicMetadata.ogTitle && !publicMetadata.ogTitle.includes(postValue.title)) {
      issues.push({
        code: 'public_title_mismatch',
        severity: 'warning',
        message: 'The public og:title does not match the private post title.',
        recommendedAction: 'Run optimize-medium-post to sync SEO title and republish.'
      });
    }

    if (publicMetadata && postValue.mediumUrl && publicMetadata.canonicalUrl && publicMetadata.canonicalUrl !== postValue.mediumUrl) {
      issues.push({
        code: 'canonical_diverges_from_medium_url',
        severity: 'info',
        message: 'The public canonical URL differs from the Medium URL.',
        recommendedAction: 'Keep it if an external canonical is intentional; otherwise run optimize-medium-post or replace-imported-medium-post to resync canonicals.'
      });
    }

    if (typeof postValue.importedPublishedAt === 'number' && typeof postValue.firstPublishedAt === 'number' && postValue.importedPublishedAt === postValue.firstPublishedAt) {
      issues.push({
        code: 'likely_imported_date_lock',
        severity: 'info',
        message: 'The post looks imported and its public byline is likely anchored to the original imported publication date.',
        recommendedAction: 'If you need a current byline, use replace-imported-medium-post instead of trying to force the original URL.'
      });
    }

    if (postValue.allowResponses === false) {
      issues.push({
        code: 'responses_disabled',
        severity: 'info',
        message: 'Responses are disabled, which can reduce engagement and visible post interaction.',
        recommendedAction: 'Run optimize-medium-visibility to enable responses if discussion is desirable for this article.'
      });
    }

    if (settingsState.isLocked || publishDialogState.isMarkedPaywallOnly) {
      issues.push({
        code: 'member_locked_or_paywalled',
        severity: 'info',
        message: 'The post appears locked or paywalled, which may reduce reach depending on the distribution goal.',
        recommendedAction: 'Review whether the lock state is intentional. No verified unlock mutation is captured in this tool yet.'
      });
    }

    issues.push(...appealAssessment.issues);

    return {
      postId: input.postId,
      privateState: {
        title: postValue.title || null,
        mediumUrl: postValue.mediumUrl || null,
        uniqueSlug: postValue.uniqueSlug || null,
        firstPublishedAt: postValue.firstPublishedAt || null,
        latestPublishedAt: postValue.latestPublishedAt || null,
        importedUrl: postValue.importedUrl || null,
        importedPublishedAt: postValue.importedPublishedAt || null,
        previewSubtitle: draftValue.previewContent?.subtitle || null,
        derivedSubtitle: subtitle || null,
        derivedSeoDescription: seoDescription || null,
        introParagraph: introText || null,
        hasUnpublishedEdits: postValue.hasUnpublishedEdits || false,
        allowResponses: typeof postValue.allowResponses === 'boolean' ? postValue.allowResponses : null,
        hasPreviewImage: this.postHasCoverImage(postValue)
      },
      visibilityState: {
        visibility: publishDialogState.visibility ?? settingsState.visibility ?? postValue.visibility ?? null,
        isLocked: publishDialogState.isLocked ?? settingsState.isLocked ?? postValue.isLocked ?? null,
        isMarkedPaywallOnly: publishDialogState.isMarkedPaywallOnly ?? null,
        isPublishToEmail: publishDialogState.isPublishToEmail ?? null,
        isNewsletter: publishDialogState.isNewsletter ?? null,
        responseDistribution: settingsState.responseDistribution ?? postValue.responseDistribution ?? null,
        curationEligibleAt: publishDialogState.curationEligibleAt ?? settingsState.curationEligibleAt ?? null
      },
      appealAssessment,
      publicMetadata,
      issues
    };
  }

  public async optimizeExistingPost(input: OptimizeMediumPostInput) {
    const post = await this.legacyClient.getPost(input.postId);
    const draft = await this.legacyClient.getDraft(input.postId);
    const draftValue = parsePayloadValue(draft);
    const postValue = parsePayloadValue(post);
    const intro = input.intro?.trim() || extractIntroParagraphText(draftValue) || '';
    const autoRewritePackage = input.autoRewritePackage === true;
    const packageOptimization = autoRewritePackage
      ? optimizeMediumDraftPackage({
          title: input.title?.trim() || postValue.title || 'Untitled draft',
          subtitle: input.subtitle?.trim() || this.deriveSubtitleFromPost(draftValue),
          intro,
          markdown: intro || postValue.title || 'Draft',
          tags: input.tagNames,
          seoTitle: input.seoTitle,
          seoDescription: input.seoDescription,
          hasCoverImage: this.postHasCoverImage(postValue)
        })
      : null;

    const title = input.title?.trim() || packageOptimization?.optimized.title || postValue.title || undefined;
    const subtitle = input.subtitle?.trim() || packageOptimization?.optimized.subtitle || this.deriveSubtitleFromPost(draftValue);
    const seoTitle = input.seoTitle?.trim() || packageOptimization?.optimized.seoTitle || title;
    const seoDescription = input.seoDescription?.trim() || packageOptimization?.optimized.seoDescription || this.deriveSeoDescription(draftValue, subtitle);
    const tagNames = input.tagNames?.length ? input.tagNames : packageOptimization?.optimized.tags;
    const nextIntro = input.intro?.trim() || packageOptimization?.optimized.intro;
    const coverImage = input.coverImagePath?.trim()
      ? await this.attachCoverImage(input.postId, input.coverImagePath.trim(), input.coverImageCaption)
      : null;

    const updated = await this.updateExistingPostFrontMatter({
      postId: input.postId,
      title,
      subtitle,
      intro: nextIntro,
      seoTitle,
      seoDescription,
      canonicalUrl: input.canonicalUrl
    });

    if (tagNames?.length) {
      await this.applyOptionalGraphqlMetadata(input.postId, {
        tagNames
      });
    }

    const finalPostValue = parsePayloadValue(updated.finalPost);
    const publicMetadata = finalPostValue.mediumUrl ? await this.fetchPublicMetadata(finalPostValue.mediumUrl) : null;

    return {
      postId: input.postId,
      applied: {
        title: title || null,
        subtitle: subtitle || null,
        seoTitle: seoTitle || null,
        seoDescription: seoDescription || null,
        canonicalUrl: input.canonicalUrl || null,
        tagNames: tagNames || []
      },
      coverImage,
      packageOptimization,
      finalState: {
        title: finalPostValue.title || null,
        mediumUrl: finalPostValue.mediumUrl || null,
        firstPublishedAt: finalPostValue.firstPublishedAt || null,
        latestPublishedAt: finalPostValue.latestPublishedAt || null,
        hasUnpublishedEdits: finalPostValue.hasUnpublishedEdits || false,
        previewSubtitle: parsePayloadValue(updated.finalDraft).previewContent?.subtitle || null
      },
      publicMetadata
    };
  }

  public async createShareKey(postId: string) {
    const response = await this.graphqlClient.executeRegisteredOperation('create-post-share-key', {
      body: {
        variables: {
          postId
        }
      }
    });
    const post = await this.legacyClient.getPost(postId);
    const postValue = parsePayloadValue(post);
    const key = ((response.data as any)?.data?.createPostShareKey?.key || null) as string | null;

    return {
      postId,
      mediumUrl: postValue.mediumUrl || null,
      shareKey: key
    };
  }

  public async deletePost(postId: string): Promise<DeleteMediumPostResult> {
    const response = await this.graphqlClient.executeRegisteredOperation('delete-post', {
      body: {
        variables: {
          targetPostId: postId
        }
      },
      referer: `https://medium.com/p/${postId}/settings`
    });

    return {
      postId,
      deleted: Boolean((response.data as any)?.data?.deletePost),
      response: response.data
    };
  }

  public async undeletePost(postId: string): Promise<UndeleteMediumPostResult> {
    const response = await this.graphqlClient.executeRegisteredOperation('undelete-post', {
      body: {
        variables: {
          targetPostId: postId
        }
      },
      referer: 'https://medium.com/me/stories/deleted'
    });

    return {
      postId,
      undeleted: Boolean((response.data as any)?.data?.undeletePost),
      response: response.data
    };
  }

  public async optimizeVisibility(input: OptimizeMediumVisibilityInput) {
    const before = await this.inspectPostState({
      postId: input.postId
    });
    const actions: Record<string, unknown> = {};

    if (input.ensurePublishingFlowDefaults !== false) {
      actions.setPublishingFlowDefaults = await this.graphqlClient.executeRegisteredOperation('set-publishing-flow-defaults', {
        body: {
          variables: {
            postId: input.postId
          }
        }
      });
    }

    if (input.enableResponses !== false && before.privateState.allowResponses === false) {
      actions.setPostAllowResponses = await this.graphqlClient.executeRegisteredOperation('post-allow-responses', {
        body: {
          variables: {
            targetPostId: input.postId,
            allowResponses: true
          }
        }
      });
    }

    if (input.createShareKey !== false) {
      actions.shareKey = await this.createShareKey(input.postId);
    }

    const after = await this.inspectPostState({
      postId: input.postId
    });

    return {
      postId: input.postId,
      actions,
      before,
      after
    };
  }

  public async testWritePath(input: TestMediumWritePathInput = {}) {
    const title = input.title?.trim() || 'Medium MCP Write Path Check';
    const subtitle = input.subtitle?.trim() || 'Disposable draft created to verify the legacy editor write path.';
    const markdown = input.markdown?.trim() || [
      'This draft exists only to confirm that the MCP can create and read back Medium editor content safely.',
      '',
      '## Verification checklist',
      '',
      '- Draft shell opened successfully.',
      '- Title and subtitle wrote successfully.',
      '- Body content round-tripped through the legacy editor.'
    ].join('\n');

    const created = await this.richDraftWriter.createDraft({
      title,
      subtitle,
      markdown,
      draftBody: input.draftBody
    });
    const post = await this.legacyClient.getPost(created.postId);
    const draft = await this.legacyClient.getDraft(created.postId);
    const postValue = parsePayloadValue(post);
    const draftValue = parsePayloadValue(draft);
    const paragraphs = draftValue.content?.bodyModel?.paragraphs || postValue.content?.bodyModel?.paragraphs || [];
    const paragraphTexts = paragraphs
      .map((paragraph) => typeof paragraph.text === 'string' ? paragraph.text.trim() : '')
      .filter(Boolean);

    return {
      postId: created.postId,
      created,
      verification: {
        titleMatches: postValue.title === title,
        previewSubtitleMatches: draftValue.previewContent?.subtitle === subtitle,
        bodyContainsVerificationChecklist: paragraphTexts.some((text) => text.includes('Verification checklist')),
        latestRev: typeof postValue.latestRev === 'number' ? postValue.latestRev : null,
        paragraphCount: paragraphTexts.length
      },
      cleanupNote: 'This tool creates a disposable Medium draft but does not delete it automatically.'
    };
  }

  public async publishOptimizedDraft(input: PublishOptimizedMediumDraftInput) {
    const articleOptimization = optimizeMediumArticleDraft({
      title: input.title,
      subtitle: input.subtitle,
      intro: input.intro,
      markdown: input.markdown,
      tags: input.tagNames,
      seoTitle: input.seoTitle,
      seoDescription: input.seoDescription,
      hasCoverImage: input.hasCoverImage,
      audience: input.audience,
      maxPasses: input.maxPasses,
      minScore: input.minScore
    });

    const draft = await this.richDraftWriter.createDraft({
      title: articleOptimization.optimized.title,
      subtitle: articleOptimization.optimized.subtitle,
      markdown: articleOptimization.optimized.markdown,
      draftBody: input.draftBody
    });
    const coverImage = input.coverImagePath?.trim()
      ? await this.attachCoverImage(draft.postId, input.coverImagePath.trim(), input.coverImageCaption)
      : null;

    const metadataResponses = await this.applyOptionalGraphqlMetadata(draft.postId, {
      canonicalUrl: input.canonicalUrl,
      seoDescription: articleOptimization.optimized.seoDescription,
      seoTitle: articleOptimization.optimized.seoTitle,
      subtitle: articleOptimization.optimized.subtitle,
      tagNames: articleOptimization.optimized.tags
    });

    const publishResponse = await this.legacyClient.publishPost(draft.postId);
    const finalPost = await this.legacyClient.getPost(draft.postId);
    const finalDraft = await this.legacyClient.getDraft(draft.postId);
    const finalPostValue = parsePayloadValue(finalPost);
    const publicMetadata = finalPostValue.mediumUrl ? await this.fetchPublicMetadata(finalPostValue.mediumUrl) : null;
    const visibility = input.optimizeVisibility
      ? await this.optimizeVisibility({
          postId: draft.postId,
          createShareKey: input.createShareKey,
          ensurePublishingFlowDefaults: true,
          enableResponses: true
        })
      : null;
    const share = !input.optimizeVisibility && input.createShareKey
      ? await this.createShareKey(draft.postId)
      : null;

    return {
      postId: draft.postId,
      articleOptimization,
      draft,
      coverImage,
      metadataResponses,
      publishResponse,
      finalState: {
        title: finalPostValue.title || null,
        mediumUrl: finalPostValue.mediumUrl || null,
        firstPublishedAt: finalPostValue.firstPublishedAt || null,
        latestPublishedAt: finalPostValue.latestPublishedAt || null,
        previewSubtitle: parsePayloadValue(finalDraft).previewContent?.subtitle || null
      },
      publicMetadata,
      visibility,
      share
    };
  }

  public async clonePostToFreshPost(input: CloneMediumPostInput) {
    const sourceDraft = await this.legacyClient.getDraft(input.postId);
    const sourceValue = parsePayloadValue(sourceDraft);
    const sourceParagraphs = cloneJson(sourceValue.content?.bodyModel?.paragraphs || []);

    if (!sourceParagraphs.length) {
      throw new Error(`Source post "${input.postId}" has no legacy bodyModel paragraphs to clone.`);
    }

    const titleIndex = findTitleParagraphIndex(sourceParagraphs);
    if (input.title?.trim() && titleIndex >= 0) {
      sourceParagraphs[titleIndex].text = input.title.trim();
    }

    const subtitle = input.subtitle?.trim() || sourceValue.previewContent?.subtitle || undefined;
    const createdDraft = await this.legacyClient.createDraft(input.draftBody || {});
    const createdPayload = (createdDraft.data as any)?.payload || {};
    const newPostId = createdPayload.id || createdPayload.value?.id;

    if (!newPostId || typeof newPostId !== 'string') {
      throw new Error('Medium did not return a draft post ID from /new-story.');
    }

    const initializedPost = await this.ensureInitializedDraft(newPostId);
    const initializedValue = parsePayloadValue(initializedPost);
    const baseRev = typeof initializedValue.latestRev === 'number' ? initializedValue.latestRev : 0;

    const insertDeltas = sourceParagraphs.map((paragraph, index) => ({
      type: 1,
      index,
      paragraph
    }));

    if (subtitle) {
      insertDeltas.push({
        type: 5,
        text: subtitle
      } as any);
    }

    const applyResponse = await this.legacyClient.applyDeltas(newPostId, baseRev, insertDeltas);
    const metadataResponses = await this.applyOptionalGraphqlMetadata(newPostId, {
      canonicalUrl: input.canonicalUrl,
      seoDescription: input.seoDescription,
      seoTitle: input.seoTitle,
      subtitle,
      tagNames: input.tagNames
    });

    const publishResponse = input.publish ? await this.legacyClient.publishPost(newPostId) : null;
    const finalPost = await this.legacyClient.getPost(newPostId);
    const finalDraft = await this.legacyClient.getDraft(newPostId);
    const finalValue = parsePayloadValue(finalPost);

    return {
      sourcePostId: input.postId,
      newPostId,
      createdDraft,
      applyResponse,
      metadataResponses,
      publishResponse,
      title: finalValue.title || null,
      mediumUrl: finalValue.mediumUrl || null,
      uniqueSlug: finalValue.uniqueSlug || null,
      firstPublishedAt: finalValue.firstPublishedAt || null,
      latestPublishedAt: finalValue.latestPublishedAt || null,
      hasUnpublishedEdits: finalValue.hasUnpublishedEdits || false,
      previewSubtitle: parsePayloadValue(finalDraft).previewContent?.subtitle || null
    };
  }

  public async replaceImportedPost(input: ReplaceImportedMediumPostInput) {
    const sourcePost = await this.legacyClient.getPost(input.postId);
    const sourceValue = parsePayloadValue(sourcePost);
    const sourceTitle = sourceValue.title || null;
    const publishedAt = typeof sourceValue.firstPublishedAt === 'number'
      ? new Date(sourceValue.firstPublishedAt)
      : null;
    const dateLabel = publishedAt
      ? publishedAt.toLocaleDateString('en-US', {
          timeZone: 'UTC',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        })
      : 'the original publish date';
    const year = publishedAt ? String(publishedAt.getUTCFullYear()) : 'Original';

    const replacement = await this.clonePostToFreshPost({
      ...input,
      publish: input.publish !== false
    });

    let historicalStub: UpdatedFrontMatterResult | null = null;

    if (input.convertOriginalToHistoricalStub !== false) {
      const replacementUrl = String(replacement.mediumUrl || '').trim();
      if (!replacementUrl) {
        throw new Error('Replacement post did not return a Medium URL, so the original post cannot be converted into a stub.');
      }

      const historicalTitle = input.historicalTitle?.trim() || buildHistoricalTitle(year, sourceTitle);
      const historicalSubtitle =
        input.historicalSubtitle?.trim() ||
        `Original ${dateLabel} Medium publication. Republished and polished current version available at the newer Medium URL.`;
      const historicalIntro =
        input.historicalIntro?.trim() ||
        `This is the original ${dateLabel} Medium publication path. The fully republished and polished version is available here: ${replacementUrl}`;
      const historicalSeoTitle = input.historicalSeoTitle?.trim() || historicalTitle;
      const historicalSeoDescription =
        input.historicalSeoDescription?.trim() ||
        `Original ${dateLabel} Medium publication for CVE-2021-21735. The republished and polished current version is available at the newer Medium URL.`;

      historicalStub = await this.updateExistingPostFrontMatter({
        postId: input.postId,
        title: historicalTitle,
        subtitle: historicalSubtitle,
        intro: historicalIntro,
        seoTitle: historicalSeoTitle,
        seoDescription: historicalSeoDescription,
        canonicalUrl: replacementUrl
      });
    }

    return {
      sourcePostId: input.postId,
      sourceTitle,
      replacement,
      historicalStub: historicalStub
        ? {
            title: parsePayloadValue(historicalStub.finalPost).title || null,
            previewSubtitle: parsePayloadValue(historicalStub.finalDraft).previewContent?.subtitle || null,
            mediumUrl: parsePayloadValue(historicalStub.finalPost).mediumUrl || null
          }
        : null
    };
  }
}

export default MediumPostWorkflows;
