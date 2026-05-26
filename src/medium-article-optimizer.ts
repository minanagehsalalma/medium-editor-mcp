import {
  optimizeMediumDraftPackage,
  type MediumDraftPackageOptimizationResult,
  type OptimizeMediumDraftPackageInput
} from './medium-draft-optimizer';
import { auditMediumDraft, type MediumDraftAuditResult } from './medium-draft-audit';

export interface OptimizeMediumArticleDraftInput extends OptimizeMediumDraftPackageInput {
  maxPasses?: number;
  minScore?: number;
}

export interface MediumArticleOptimizationPass {
  actions: string[];
  audit: MediumDraftAuditResult;
  pass: number;
}

export interface MediumArticleOptimizationResult {
  changedFields: string[];
  finalAudit: MediumDraftAuditResult;
  optimized: {
    intro: string;
    markdown: string;
    seoDescription: string;
    seoTitle: string;
    subtitle: string;
    tags: string[];
    title: string;
  };
  packageOptimization: MediumDraftPackageOptimizationResult;
  passes: MediumArticleOptimizationPass[];
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function countWords(value: string) {
  const normalized = normalizeWhitespace(value);
  return normalized ? normalized.split(/\s+/).filter(Boolean).length : 0;
}

function splitMarkdownLines(markdown: string) {
  return markdown.replace(/\r\n/g, '\n').split('\n');
}

function joinMarkdownLines(lines: string[]) {
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd();
}

function hasSection(markdown: string, heading: string) {
  const pattern = new RegExp(`^##\\s+${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'im');
  return pattern.test(markdown);
}

function appendSection(markdown: string, heading: string, body: string) {
  const suffix = markdown.trim().length ? '\n\n' : '';
  return `${markdown.trimEnd()}${suffix}## ${heading}\n\n${body}\n`;
}

function insertAfterLead(markdown: string, sectionMarkdown: string) {
  const lines = splitMarkdownLines(markdown);
  let inCodeFence = false;
  let firstBodyEnd = -1;

  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = lines[index].trim();
    if (/^```/.test(trimmed)) {
      inCodeFence = !inCodeFence;
      continue;
    }

    if (inCodeFence || !trimmed || /^#/.test(trimmed)) {
      continue;
    }

    if (/^>/.test(trimmed)) {
      const cleaned = trimmed.replace(/^>\s?/, '');
      if (/^subtitle:/i.test(cleaned) || /^canonical source:/i.test(cleaned) || /^reader promise:/i.test(cleaned)) {
        continue;
      }
    }

    firstBodyEnd = index;
    for (let probe = index + 1; probe < lines.length; probe += 1) {
      const next = lines[probe].trim();
      if (!next) {
        firstBodyEnd = probe;
        break;
      }

      if (/^##/.test(next)) {
        firstBodyEnd = probe - 1;
        break;
      }

      firstBodyEnd = probe;
    }
    break;
  }

  if (firstBodyEnd < 0) {
    return appendSection(markdown, 'Why this matters', sectionMarkdown);
  }

  const nextLines = [...lines];
  const insertIndex = firstBodyEnd + 1;
  nextLines.splice(insertIndex, 0, '', sectionMarkdown.trim(), '');
  return joinMarkdownLines(nextLines);
}

function splitLongParagraphs(markdown: string) {
  const lines = splitMarkdownLines(markdown);
  const nextLines: string[] = [];
  let changed = false;

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (
      !trimmed ||
      /^#/.test(trimmed) ||
      /^>/.test(trimmed) ||
      /^[-*]\s+/.test(trimmed) ||
      /^\d+\.\s+/.test(trimmed) ||
      /^```/.test(trimmed)
    ) {
      nextLines.push(line);
      return;
    }

    if (countWords(trimmed) <= 90) {
      nextLines.push(line);
      return;
    }

    const sentences = trimmed.match(/[^.!?]+[.!?]?/g)?.map((sentence) => sentence.trim()).filter(Boolean) || [trimmed];
    if (sentences.length < 2) {
      nextLines.push(line);
      return;
    }

    changed = true;
    const midpoint = Math.ceil(sentences.length / 2);
    nextLines.push(sentences.slice(0, midpoint).join(' '));
    nextLines.push('');
    nextLines.push(sentences.slice(midpoint).join(' '));
  });

  return {
    changed,
    markdown: joinMarkdownLines(nextLines)
  };
}

export function optimizeMediumArticleDraft(input: OptimizeMediumArticleDraftInput): MediumArticleOptimizationResult {
  const packageOptimization = optimizeMediumDraftPackage(input);
  const maxPasses = Math.max(1, input.maxPasses ?? 3);
  const minScore = input.minScore ?? 88;
  const passes: MediumArticleOptimizationPass[] = [];

  let current = {
    ...packageOptimization.optimized
  };
  let bestAudit = packageOptimization.auditAfter;

  for (let pass = 1; pass <= maxPasses; pass += 1) {
    const actions: string[] = [];

    if (bestAudit.issues.some((issue) => issue.code === 'long_paragraphs')) {
      const split = splitLongParagraphs(current.markdown);
      if (split.changed) {
        current.markdown = split.markdown;
        actions.push('split_long_paragraphs');
      }
    }

    const nextAudit = auditMediumDraft({
      title: current.title,
      subtitle: current.subtitle,
      markdown: current.markdown,
      tags: current.tags,
      seoTitle: current.seoTitle,
      seoDescription: current.seoDescription,
      hasCoverImage: input.hasCoverImage
    });

    passes.push({
      pass,
      actions,
      audit: nextAudit
    });

    if (nextAudit.score <= bestAudit.score || !actions.length) {
      break;
    }

    bestAudit = nextAudit;
    if (bestAudit.score >= minScore) {
      break;
    }
  }

  const finalAudit = auditMediumDraft({
    title: current.title,
    subtitle: current.subtitle,
    markdown: current.markdown,
    tags: current.tags,
    seoTitle: current.seoTitle,
    seoDescription: current.seoDescription,
    hasCoverImage: input.hasCoverImage
  });

  const changedFields = [
    ...packageOptimization.changedFields,
    ...(current.markdown !== packageOptimization.optimized.markdown ? ['markdown_body'] : [])
  ];

  return {
    packageOptimization,
    passes,
    changedFields,
    finalAudit,
    optimized: current
  };
}
