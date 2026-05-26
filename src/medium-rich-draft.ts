import MediumLegacyEditorClient from './medium-legacy-editor';
import * as fs from 'fs';
import * as path from 'path';

export const MEDIUM_PARAGRAPH_TYPES = {
  paragraph: 1,
  h2: 2,
  h3: 3,
  subtitle: 4,
  blockquote: 6,
  pullquote: 7,
  code: 8,
  'ul-li': 9,
  'ol-li': 10,
  h1: 12,
  h4: 13,
  mixtape: 14,
  'section-caption': 15,
  'cover-title': 16
} as const;

type MediumParagraphTypeName = keyof typeof MEDIUM_PARAGRAPH_TYPES;

export interface MediumRichDraftBlock {
  codeLang?: string;
  imageAlt?: string;
  imageUrl?: string;
  layout?: number;
  markups?: unknown[];
  metadata?: Record<string, unknown>;
  name?: string;
  text: string;
  type?: MediumParagraphTypeName | number;
}

export interface MediumWriteDraftInput {
  append?: boolean;
  blocks?: MediumRichDraftBlock[];
  markdown?: string;
  postId: string;
  subtitle?: string;
  title?: string;
}

export interface MediumCreateDraftInput {
  append?: boolean;
  blocks?: MediumRichDraftBlock[];
  draftBody?: Record<string, unknown>;
  markdown?: string;
  subtitle?: string;
  title: string;
}

interface MediumInlineRender {
  markups: unknown[];
  text: string;
}

export interface MediumFormattingWarning {
  code: string;
  index: number;
  textPreview: string;
}

function normalizeBlockType(type?: MediumParagraphTypeName | number): number {
  if (typeof type === 'number') {
    return type;
  }

  if (!type) {
    return MEDIUM_PARAGRAPH_TYPES.paragraph;
  }

  return MEDIUM_PARAGRAPH_TYPES[type] || MEDIUM_PARAGRAPH_TYPES.paragraph;
}

function pushParagraphBlock(blocks: MediumRichDraftBlock[], text: string, type: MediumParagraphTypeName | number, codeLang?: string) {
  const normalizedText = text.trim();
  if (!normalizedText) {
    return;
  }

  const normalizedType = normalizeBlockType(type);
  const inline = normalizedType === MEDIUM_PARAGRAPH_TYPES.code
    ? { text: normalizedText, markups: [] }
    : renderInlineMarkdownToMedium(normalizedText);

  blocks.push({
    type,
    text: inline.text,
    markups: inline.markups,
    ...(codeLang ? { codeLang } : {})
  });
}

function pushImageBlock(blocks: MediumRichDraftBlock[], imageUrl: string, imageAlt?: string | null) {
  const normalizedUrl = imageUrl.trim();
  if (!normalizedUrl) {
    return;
  }

  blocks.push({
    imageAlt: imageAlt?.trim() || undefined,
    imageUrl: normalizedUrl,
    text: imageAlt?.trim() || ''
  });
}

function isMarkdownTableLine(line: string) {
  const trimmed = line.trim();
  return /^\|.+\|$/.test(trimmed);
}

function isMarkdownTableSeparator(line: string) {
  return /^\|\s*:?[-]+:?\s*(\|\s*:?[-]+:?\s*)+\|$/.test(line.trim());
}

function splitMarkdownTableRow(line: string) {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

function pushMarkdownTableBlocks(blocks: MediumRichDraftBlock[], tableLines: string[]) {
  const contentLines = tableLines.filter((line) => !isMarkdownTableSeparator(line));
  if (contentLines.length < 2) {
    tableLines.forEach((line) => pushParagraphBlock(blocks, line.trim(), 'paragraph'));
    return;
  }

  const header = splitMarkdownTableRow(contentLines[0]);
  const rows = contentLines.slice(1).map(splitMarkdownTableRow).filter((row) => row.some((cell) => cell.length > 0));
  if (!header.length || !rows.length) {
    tableLines.forEach((line) => pushParagraphBlock(blocks, line.trim(), 'paragraph'));
    return;
  }

  if (header.length === 2) {
    rows.forEach((row) => {
      const left = row[0] || '';
      const right = row[1] || '';
      if (left || right) {
        pushParagraphBlock(blocks, `${left}: ${right}`.trim(), 'ul-li');
      }
    });
    return;
  }

  rows.forEach((row) => {
    const summary = row
      .map((cell, index) => {
        const key = header[index] || `Column ${index + 1}`;
        return `${key}: ${cell}`;
      })
      .join(' | ');
    pushParagraphBlock(blocks, summary, 'paragraph');
  });
}

function renderInlineMarkdownToMedium(text: string): MediumInlineRender {
  const markups: Array<Record<string, unknown>> = [];
  let sourceIndex = 0;
  let output = '';

  const pushLinkMarkup = (start: number, end: number, href: string) => {
    markups.push({
      type: 3,
      start,
      end,
      href,
      title: '',
      rel: 'nofollow',
      anchorType: 0
    });
  };

  const pushPlain = (value: string) => {
    if (!value) {
      return;
    }

    output += value;
  };

  while (sourceIndex < text.length) {
    const slice = text.slice(sourceIndex);
    const tokenMatch = slice.match(
      /^(\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*|`([^`]+)`|\*([^*]+)\*|(https?:\/\/[^\s<]+[^\s<.,;:!?")\]]))/
    );

    if (!tokenMatch) {
      pushPlain(text[sourceIndex]);
      sourceIndex += 1;
      continue;
    }

    const tokenStart = sourceIndex + tokenMatch.index!;
    if (tokenStart > sourceIndex) {
      pushPlain(text.slice(sourceIndex, tokenStart));
    }

    const fullMatch = tokenMatch[1];
    const outputStart = output.length;

    if (tokenMatch[2] !== undefined && tokenMatch[3] !== undefined) {
      const label = tokenMatch[2];
      pushPlain(label);
      pushLinkMarkup(outputStart, output.length, tokenMatch[3]);
    } else if (tokenMatch[4] !== undefined) {
      const strongText = tokenMatch[4];
      pushPlain(strongText);
      markups.push({
        type: 1,
        start: outputStart,
        end: output.length
      });
    } else if (tokenMatch[5] !== undefined) {
      const codeText = tokenMatch[5];
      pushPlain(codeText);
    } else if (tokenMatch[6] !== undefined) {
      const emText = tokenMatch[6];
      pushPlain(emText);
      markups.push({
        type: 2,
        start: outputStart,
        end: output.length
      });
    } else if (tokenMatch[7] !== undefined) {
      const href = tokenMatch[7];
      pushPlain(href);
      pushLinkMarkup(outputStart, output.length, href);
    } else {
      pushPlain(fullMatch);
    }

    sourceIndex = tokenStart + fullMatch.length;
  }

  return {
    text: output,
    markups
  };
}

export function parseMarkdownToMediumBlocks(markdown: string): MediumRichDraftBlock[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const blocks: MediumRichDraftBlock[] = [];
  let paragraphLines: string[] = [];
  let tableLines: string[] = [];
  let codeFenceLang: string | undefined;
  let codeLines: string[] = [];
  let inCodeFence = false;

  const flushParagraph = () => {
    if (!paragraphLines.length) {
      return;
    }

    const text = paragraphLines.join(' ').trim();
    paragraphLines = [];
    if (!text) {
      return;
    }

    const headingMatch = text.match(/^(#{1,4})\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const content = headingMatch[2].trim();
      if (level === 1) {
        pushParagraphBlock(blocks, content, 'h1');
      } else if (level === 2) {
        pushParagraphBlock(blocks, content, 'h2');
      } else if (level === 3) {
        pushParagraphBlock(blocks, content, 'h3');
      } else {
        pushParagraphBlock(blocks, content, 'h4');
      }
      return;
    }

    const quoteMatch = text.match(/^>\s?(.*)$/);
    if (quoteMatch) {
      pushParagraphBlock(blocks, quoteMatch[1].trim(), 'blockquote');
      return;
    }

    const orderedMatch = text.match(/^\d+\.\s+(.*)$/);
    if (orderedMatch) {
      pushParagraphBlock(blocks, orderedMatch[1].trim(), 'ol-li');
      return;
    }

    const unorderedMatch = text.match(/^[-*]\s+(.*)$/);
    if (unorderedMatch) {
      pushParagraphBlock(blocks, unorderedMatch[1].trim(), 'ul-li');
      return;
    }

    pushParagraphBlock(blocks, text, 'paragraph');
  };

  const flushCodeFence = () => {
    if (!codeLines.length) {
      return;
    }

    blocks.push({
      type: 'code',
      text: codeLines.join('\n'),
      markups: [],
      ...(codeFenceLang ? { codeLang: codeFenceLang } : {})
    });
    codeLines = [];
    codeFenceLang = undefined;
  };

  const flushTable = () => {
    if (!tableLines.length) {
      return;
    }

    pushMarkdownTableBlocks(blocks, tableLines);
    tableLines = [];
  };

  for (const line of lines) {
    const markdownImageMatch = line.trim().match(/^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)$/i);
    const htmlImageMatch = line.trim().match(/^<img\b[^>]*?\bsrc=["']([^"']+)["'][^>]*>$/i);
    if (markdownImageMatch) {
      flushParagraph();
      flushTable();
      pushImageBlock(blocks, markdownImageMatch[2], markdownImageMatch[1]);
      continue;
    }

    if (htmlImageMatch) {
      flushParagraph();
      flushTable();
      const altMatch = line.match(/\balt=["']([^"']+)["']/i);
      pushImageBlock(blocks, htmlImageMatch[1], altMatch?.[1] || null);
      continue;
    }

    const fenceMatch = line.match(/^```(\S+)?\s*$/);
    if (fenceMatch) {
      if (inCodeFence) {
        flushCodeFence();
        inCodeFence = false;
      } else {
        flushParagraph();
        flushTable();
        inCodeFence = true;
        codeFenceLang = fenceMatch[1] || undefined;
      }
      continue;
    }

    if (inCodeFence) {
      codeLines.push(line);
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      flushTable();
      continue;
    }

    if (isMarkdownTableLine(line)) {
      flushParagraph();
      tableLines.push(line.trim());
      continue;
    }

    if (tableLines.length) {
      flushTable();
    }

    if (
      /^(#{1,4})\s+/.test(line) ||
      /^>\s?/.test(line) ||
      /^\d+\.\s+/.test(line) ||
      /^[-*]\s+/.test(line)
    ) {
      flushParagraph();
      paragraphLines.push(line);
      flushParagraph();
      continue;
    }

    paragraphLines.push(line.trim());
  }

  flushParagraph();
  flushTable();
  if (inCodeFence) {
    flushCodeFence();
  }

  return blocks;
}

export function buildParagraphDeltasFromBlocks(blocks: MediumRichDraftBlock[]) {
  return blocks
    .filter((block) => !block.imageUrl)
    .map((block, index) => ({
      type: 1,
      index,
      paragraph: {
        type: normalizeBlockType(block.type),
        text: block.text,
      markups: block.markups || [],
      ...(block.name ? { name: block.name } : {}),
      ...(block.layout !== undefined ? { layout: block.layout } : {}),
      ...(block.metadata ? { metadata: block.metadata } : {}),
      ...(block.codeLang ? { codeLang: block.codeLang } : {})
    }
  }));
}

function collectFormattingWarnings(paragraphs: Array<{ text?: string; type?: number }>): MediumFormattingWarning[] {
  const warnings: MediumFormattingWarning[] = [];
  const rawMarkdownPattern = /(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\)|\*[^*\n]+\*)/;

  paragraphs.forEach((paragraph, index) => {
    if (paragraph?.type === MEDIUM_PARAGRAPH_TYPES.code) {
      return;
    }

    const text = typeof paragraph?.text === 'string' ? paragraph.text : '';
    if (!text || !rawMarkdownPattern.test(text)) {
      return;
    }

    warnings.push({
      code: 'raw_markdown_tokens_detected',
      index,
      textPreview: text.slice(0, 120)
    });
  });

  return warnings;
}

function dropDuplicateLeadingTitle(blocks: MediumRichDraftBlock[], title?: string) {
  if (!title || !blocks.length) {
    return blocks;
  }

  const [first, ...rest] = blocks;
  const normalizedTitle = title.trim();
  const normalizedFirst = first.text.trim();
  if (!normalizedTitle || normalizedFirst !== normalizedTitle) {
    return blocks;
  }

  if (normalizeBlockType(first.type) !== MEDIUM_PARAGRAPH_TYPES.h1) {
    return blocks;
  }

  return rest;
}

function isNonEmptyParagraph(paragraph: any) {
  return Boolean(paragraph && typeof paragraph.text === 'string' && paragraph.text.trim().length > 0);
}

function buildImageFilename(imageUrl: string) {
  if (/^[a-zA-Z]:[\\/]/.test(imageUrl) || imageUrl.startsWith('/') || imageUrl.startsWith('./') || imageUrl.startsWith('../')) {
    return path.basename(imageUrl);
  }

  try {
    const url = new URL(imageUrl);
    const pathname = url.pathname.split('/').filter(Boolean);
    const lastSegment = pathname[pathname.length - 1] || 'gist-image.png';
    return /\.[a-z0-9]+$/i.test(lastSegment) ? lastSegment : `${lastSegment}.png`;
  } catch {
    return 'gist-image.png';
  }
}

class MediumRichDraftWriter {
  constructor(private legacyClient: MediumLegacyEditorClient) {}

  private buildBlocks(input: Pick<MediumWriteDraftInput, 'blocks' | 'markdown' | 'subtitle' | 'title'>): MediumRichDraftBlock[] {
    const markdownBlocks = input.markdown ? parseMarkdownToMediumBlocks(input.markdown) : [];
    const rawBlocks = input.blocks || markdownBlocks;
    const bodyBlocks = dropDuplicateLeadingTitle(rawBlocks, input.title);
    const blocks: MediumRichDraftBlock[] = [];

    if (input.title?.trim()) {
      blocks.push({
        type: 3,
        text: input.title.trim(),
        markups: []
      });
    }

    if (input.subtitle?.trim()) {
      blocks.push({
        type: 4,
        text: input.subtitle.trim(),
        markups: []
      });
    }

    return [
      ...blocks,
      ...bodyBlocks
    ];
  }

  private async ensureInitializedDraft(postId: string) {
    const draft = await this.legacyClient.getDraft(postId);
    const payload = (draft.data as any)?.payload || {};
    const value = payload.value || {};
    const latestRev = typeof value.latestRev === 'number' ? value.latestRev : null;
    const normalizingDeltas = Array.isArray(payload.normalizingDeltas) ? payload.normalizingDeltas : [];

    if (latestRev !== null && latestRev < 0 && normalizingDeltas.length) {
      await this.legacyClient.applyDeltas(postId, latestRev, normalizingDeltas);
      const initializedPost = await this.legacyClient.getPost(postId);
      return initializedPost;
    }

    return this.legacyClient.getPost(postId);
  }

  private getAppendIndex(postValue: any): number {
    const paragraphs = Array.isArray(postValue?.content?.bodyModel?.paragraphs)
      ? postValue.content.bodyModel.paragraphs
      : [];
    const nonEmptyCount = paragraphs.filter((paragraph: any) => isNonEmptyParagraph(paragraph)).length;
    return nonEmptyCount;
  }

  private assertWritable(postValue: any, append?: boolean) {
    if (append) {
      return;
    }

    const hasTitle = typeof postValue?.title === 'string' && postValue.title.trim().length > 0;
    const paragraphs = Array.isArray(postValue?.content?.bodyModel?.paragraphs)
      ? postValue.content.bodyModel.paragraphs
      : [];
    const hasBody = paragraphs.some((paragraph: any) => isNonEmptyParagraph(paragraph));

    if (hasTitle || hasBody) {
      throw new Error(
        'Target draft is not blank. Create a fresh draft or rerun with append=true if you want to add blocks after the existing content.'
      );
    }
  }

  private async buildImageDelta(postId: string, block: MediumRichDraftBlock, index: number) {
    const imageUrl = block.imageUrl?.trim();
    if (!imageUrl) {
      throw new Error('Image block is missing imageUrl.');
    }
    let bytes: Buffer;

    if (/^https?:\/\//i.test(imageUrl)) {
      const response = await fetch(imageUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch image ${imageUrl}: HTTP ${response.status}`);
      }

      bytes = Buffer.from(await response.arrayBuffer());
    } else {
      bytes = fs.readFileSync(imageUrl);
    }

    const uploadResponse = await this.legacyClient.uploadImageBuffer(
      bytes,
      buildImageFilename(imageUrl),
      {
        is2x: true,
        referer: `https://medium.com/p/${postId}/edit`
      }
    );
    const uploadValue = (((uploadResponse.data as any)?.payload?.value) || {}) as {
      fileId?: string;
      imgHeight?: number;
      imgWidth?: number;
    };

    if (!uploadValue.fileId || !uploadValue.imgWidth || !uploadValue.imgHeight) {
      throw new Error(`Medium image upload did not return fileId/imgWidth/imgHeight for ${imageUrl}.`);
    }

    return {
      type: 1,
      index,
      paragraph: {
        type: 4,
        text: block.text || '',
        markups: [],
        layout: 1,
        metadata: {
          id: uploadValue.fileId,
          originalWidth: uploadValue.imgWidth,
          originalHeight: uploadValue.imgHeight
        }
      }
    };
  }

  private async buildDeltasFromBlocks(postId: string, blocks: MediumRichDraftBlock[], startIndex: number) {
    const deltas: unknown[] = [];

    for (let index = 0; index < blocks.length; index += 1) {
      const block = blocks[index];
      const resolvedIndex = startIndex + index;

      if (block.imageUrl) {
        deltas.push(await this.buildImageDelta(postId, block, resolvedIndex));
        continue;
      }

      deltas.push({
        type: 1,
        index: resolvedIndex,
        paragraph: {
          type: normalizeBlockType(block.type),
          text: block.text,
          markups: block.markups || [],
          ...(block.name ? { name: block.name } : {}),
          ...(block.layout !== undefined ? { layout: block.layout } : {}),
          ...(block.metadata ? { metadata: block.metadata } : {}),
          ...(block.codeLang ? { codeLang: block.codeLang } : {})
        }
      });
    }

    return deltas;
  }

  public async writeDraft(input: MediumWriteDraftInput) {
    const blocks = this.buildBlocks(input);
    if (!blocks.length) {
      throw new Error('Provide title, subtitle, markdown, or blocks to write.');
    }

    const initializedPost = await this.ensureInitializedDraft(input.postId);
    const postValue = (initializedPost.data as any)?.payload?.value || {};
    this.assertWritable(postValue, input.append);

    const baseRev = typeof postValue.latestRev === 'number' ? postValue.latestRev : 0;
    const startIndex = input.append ? this.getAppendIndex(postValue) : 0;
    const deltas = await this.buildDeltasFromBlocks(input.postId, blocks, startIndex);

    const applyResult = await this.legacyClient.applyDeltas(input.postId, baseRev, deltas);
    const finalPost = await this.legacyClient.getPost(input.postId);
    const finalDraft = await this.legacyClient.getDraft(input.postId);
    const finalValue = (finalPost.data as any)?.payload?.value || {};
    const finalParagraphs = Array.isArray(finalValue?.content?.bodyModel?.paragraphs)
      ? finalValue.content.bodyModel.paragraphs
      : [];
    const renderingWarnings = collectFormattingWarnings(finalParagraphs);

    return {
      postId: input.postId,
      baseRev,
      appliedDeltaCount: deltas.length,
      result: applyResult.data,
      title: finalValue.title || null,
      latestRev: finalValue.latestRev || null,
      previewSubtitle: (finalDraft.data as any)?.payload?.value?.previewContent?.subtitle || null,
      previewParagraphCount: ((finalDraft.data as any)?.payload?.value?.previewContent?.bodyModel?.paragraphs || []).length,
      renderingWarnings
    };
  }

  public async createDraft(input: MediumCreateDraftInput) {
    const created = await this.legacyClient.createDraft(input.draftBody || {});
    const payload = (created.data as any)?.payload || {};
    const postId = payload.id || payload.value?.id;

    if (!postId || typeof postId !== 'string') {
      throw new Error('Medium did not return a draft post ID from /new-story.');
    }

    const writeResult = await this.writeDraft({
      postId,
      title: input.title,
      subtitle: input.subtitle,
      markdown: input.markdown,
      blocks: input.blocks,
      append: input.append
    });

    return {
      created: created.data,
      ...writeResult
    };
  }
}

export default MediumRichDraftWriter;
