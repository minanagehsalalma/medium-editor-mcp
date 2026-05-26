import { suggestMediumTagsFromText } from './medium-content-strategy';
import { auditMediumDraft, type MediumDraftAuditResult } from './medium-draft-audit';

export interface OptimizeMediumDraftPackageInput {
  audience?: string;
  hasCoverImage?: boolean;
  intro?: string;
  markdown: string;
  seoDescription?: string;
  seoTitle?: string;
  subtitle?: string;
  tags?: string[];
  title: string;
}

export interface MediumDraftPackageOptimizationResult {
  auditAfter: MediumDraftAuditResult;
  auditBefore: MediumDraftAuditResult;
  changedFields: string[];
  optimized: {
    intro: string;
    markdown: string;
    seoDescription: string;
    seoTitle: string;
    subtitle: string;
    tags: string[];
    title: string;
  };
  rationale: string[];
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function truncateText(value: string, maxLength: number) {
  const normalized = normalizeWhitespace(value);
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function stripMarkdown(value: string) {
  return value
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/[*_~>#]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function sentenceCase(value: string) {
  if (!value) {
    return value;
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
}

function trimTrailingPunctuation(value: string) {
  return value.replace(/[.?!:;,\s]+$/g, '').trim();
}

function countWords(value: string) {
  const normalized = normalizeWhitespace(value);
  return normalized ? normalized.split(/\s+/).filter(Boolean).length : 0;
}

function splitSentences(value: string) {
  return normalizeWhitespace(value)
    .match(/[^.!?]+[.!?]?/g)
    ?.map((sentence) => sentence.trim())
    .filter(Boolean) || [];
}

function extractLeadParagraph(markdown: string) {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  let inCodeFence = false;
  const paragraph: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (/^```/.test(line)) {
      inCodeFence = !inCodeFence;
      continue;
    }

    if (inCodeFence) {
      continue;
    }

    if (!line) {
      if (paragraph.length) {
        break;
      }
      continue;
    }

    if (/^#/.test(line)) {
      continue;
    }

    if (/^>/.test(line)) {
      const cleaned = line.replace(/^>\s?/, '').trim();
      if (!/^subtitle:/i.test(cleaned) && !/^canonical source:/i.test(cleaned) && !/^reader promise:/i.test(cleaned)) {
        paragraph.push(cleaned);
      }
      continue;
    }

    if (/^[-*]\s+/.test(line) || /^\d+\.\s+/.test(line)) {
      if (paragraph.length) {
        break;
      }
      continue;
    }

    paragraph.push(line);
  }

  return normalizeWhitespace(paragraph.join(' '));
}

function replaceLeadParagraph(markdown: string, nextIntro: string) {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  let inCodeFence = false;
  let firstBodyStart = -1;
  let firstBodyEnd = -1;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();

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

    if (/^[-*]\s+/.test(trimmed) || /^\d+\.\s+/.test(trimmed)) {
      continue;
    }

    firstBodyStart = index;
    firstBodyEnd = index;
    for (let probe = index + 1; probe < lines.length; probe += 1) {
      const next = lines[probe].trim();
      if (!next) {
        firstBodyEnd = probe - 1;
        break;
      }

      if (/^##/.test(next) || /^```/.test(next) || /^[-*]\s+/.test(next) || /^\d+\.\s+/.test(next)) {
        firstBodyEnd = probe - 1;
        break;
      }

      firstBodyEnd = probe;
    }
    break;
  }

  if (firstBodyStart < 0) {
    return markdown;
  }

  const nextLines = [...lines];
  nextLines.splice(firstBodyStart, firstBodyEnd - firstBodyStart + 1, nextIntro);
  return nextLines.join('\n');
}

function deriveTitle(baseTitle: string, intro: string, subtitle: string) {
  const normalizedTitle = normalizeWhitespace(baseTitle);
  if (normalizedTitle.length >= 35 && normalizedTitle.length <= 95) {
    return normalizedTitle;
  }

  const cleanTitle = sentenceCase(trimTrailingPunctuation(normalizedTitle || 'Untitled draft'));
  const support = trimTrailingPunctuation(intro || subtitle);

  if (!support) {
    return truncateText(`${cleanTitle}: What Changed and How to Use It`, 92);
  }

  const suffix = support
    .replace(new RegExp(`^${cleanTitle}\\s*[:,-]?\\s*`, 'i'), '')
    .replace(/^the\s+/i, '')
    .trim();

  return truncateText(`${cleanTitle}: ${suffix}`, 92);
}

function deriveSubtitle(title: string, intro: string, existingSubtitle?: string) {
  const current = normalizeWhitespace(existingSubtitle || '');
  if (current.length >= 35 && current.length <= 160) {
    return current;
  }

  const sentences = splitSentences(intro);
  const firstSentence = sentences[0] || '';
  if (firstSentence) {
    return truncateText(firstSentence, 145);
  }

  return truncateText(`What changed, what worked, and how I got ${title.toLowerCase()} working cleanly.`, 145);
}

function deriveIntro(title: string, intro: string, subtitle: string) {
  const current = normalizeWhitespace(intro);
  if (countWords(current) >= 16) {
    return current;
  }

  const subject = trimTrailingPunctuation(title);
  const lead = trimTrailingPunctuation(subtitle);
  if (lead) {
    return truncateText(`${lead} Here is what I changed, what actually worked, and what you should verify first.`, 220);
  }

  return truncateText(`I tried ${subject}. Here is what worked, what broke, and what I changed to get it stable.`, 220);
}

function deriveSeoDescription(intro: string, subtitle: string, currentSeo?: string) {
  const current = normalizeWhitespace(currentSeo || '');
  if (current.length >= 90 && current.length <= 170) {
    return current;
  }

  return truncateText(subtitle || intro, 155);
}

function deriveSeoTitle(title: string, currentSeo?: string) {
  const current = normalizeWhitespace(currentSeo || '');
  if (current && current.length >= 25 && current.length <= 70) {
    return current;
  }

  return truncateText(title, 70);
}

export function optimizeMediumDraftPackage(input: OptimizeMediumDraftPackageInput): MediumDraftPackageOptimizationResult {
  const baseIntro = normalizeWhitespace(input.intro || extractLeadParagraph(input.markdown));
  const baseSubtitle = normalizeWhitespace(input.subtitle || '');
  const auditBefore = auditMediumDraft({
    title: input.title,
    subtitle: input.subtitle,
    markdown: input.markdown,
    tags: input.tags,
    seoTitle: input.seoTitle,
    seoDescription: input.seoDescription,
    hasCoverImage: input.hasCoverImage
  });

  const optimizedTitle = deriveTitle(input.title, baseIntro, baseSubtitle);
  const optimizedSubtitle = deriveSubtitle(optimizedTitle, baseIntro, input.subtitle);
  const optimizedIntro = deriveIntro(optimizedTitle, baseIntro, optimizedSubtitle);
  const optimizedSeoTitle = deriveSeoTitle(optimizedTitle, input.seoTitle);
  const optimizedSeoDescription = deriveSeoDescription(optimizedIntro, optimizedSubtitle, input.seoDescription);
  const optimizedTags = suggestMediumTagsFromText({
    title: optimizedTitle,
    subtitle: optimizedSubtitle,
    text: optimizedIntro,
    markdown: input.markdown,
    existingTags: input.tags,
    audience: input.audience
  });
  const optimizedMarkdown = replaceLeadParagraph(input.markdown, optimizedIntro);
  const auditAfter = auditMediumDraft({
    title: optimizedTitle,
    subtitle: optimizedSubtitle,
    markdown: optimizedMarkdown,
    tags: optimizedTags,
    seoTitle: optimizedSeoTitle,
    seoDescription: optimizedSeoDescription,
    hasCoverImage: input.hasCoverImage
  });

  const changedFields = [
    ['title', optimizedTitle, normalizeWhitespace(input.title)],
    ['subtitle', optimizedSubtitle, normalizeWhitespace(input.subtitle || '')],
    ['intro', optimizedIntro, baseIntro],
    ['seoTitle', optimizedSeoTitle, normalizeWhitespace(input.seoTitle || '')],
    ['seoDescription', optimizedSeoDescription, normalizeWhitespace(input.seoDescription || '')],
    ['tags', optimizedTags.join('|'), (input.tags || []).map((tag) => normalizeWhitespace(tag)).join('|')]
  ]
    .filter(([, nextValue, previousValue]) => nextValue !== previousValue)
    .map(([field]) => field);

  return {
    auditBefore,
    auditAfter,
    changedFields,
    optimized: {
      title: optimizedTitle,
      subtitle: optimizedSubtitle,
      intro: optimizedIntro,
      seoTitle: optimizedSeoTitle,
      seoDescription: optimizedSeoDescription,
      tags: optimizedTags,
      markdown: optimizedMarkdown
    },
    rationale: [
      'Title was kept specific instead of being broadened into generic commentary.',
      'Subtitle was tightened toward a direct payoff sentence.',
      'Lead paragraph was rewritten to get to the point faster.',
      'SEO metadata was synced to the actual angle of the piece.',
      'Tags were limited to relevant topics instead of filler coverage.'
    ]
  };
}
