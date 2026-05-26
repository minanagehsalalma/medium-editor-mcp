export interface MediumDraftAuditInput {
  hasCoverImage?: boolean;
  markdown: string;
  seoDescription?: string;
  seoTitle?: string;
  subtitle?: string;
  tags?: string[];
  title: string;
}

export interface MediumDraftAuditIssue {
  code: string;
  message: string;
  recommendedAction: string;
  severity: 'info' | 'warning';
}

export interface MediumDraftAuditResult {
  estimatedReadMinutes: number;
  issues: MediumDraftAuditIssue[];
  normalizedTags: string[];
  score: number;
  sectionHeadings: string[];
  subscores: {
    distribution: number;
    hook: number;
    scanability: number;
  };
  suggestions: string[];
  wordCount: number;
}

interface MarkdownStats {
  bulletCount: number;
  codeFenceCount: number;
  introWordCount: number;
  longParagraphCount: number;
  paragraphCount: number;
  sectionHeadings: string[];
  wordCount: number;
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function normalizeTags(tags?: string[]) {
  const seen = new Set<string>();
  const normalized: string[] = [];

  (tags || []).forEach((tag) => {
    const compact = normalizeWhitespace(tag);
    if (!compact) {
      return;
    }

    const key = compact.toLowerCase();
    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    normalized.push(compact.slice(0, 25));
  });

  return normalized.slice(0, 5);
}

function stripInlineMarkdown(value: string) {
  return value
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/[*_~>#]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function countWords(value: string) {
  const normalized = normalizeWhitespace(value);
  if (!normalized) {
    return 0;
  }

  return normalized.split(/\s+/).filter(Boolean).length;
}

function analyzeMarkdown(markdown: string): MarkdownStats {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const sectionHeadings: string[] = [];
  const paragraphs: string[] = [];
  let bulletCount = 0;
  let codeFenceCount = 0;
  let inCodeFence = false;
  let currentParagraph: string[] = [];

  const flushParagraph = () => {
    if (!currentParagraph.length) {
      return;
    }

    const text = normalizeWhitespace(currentParagraph.join(' '));
    currentParagraph = [];
    if (text) {
      paragraphs.push(text);
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (/^```/.test(line)) {
      flushParagraph();
      inCodeFence = !inCodeFence;
      if (!inCodeFence) {
        codeFenceCount += 1;
      }
      continue;
    }

    if (inCodeFence) {
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      continue;
    }

    const headingMatch = line.match(/^##+\s+(.*)$/);
    if (headingMatch) {
      flushParagraph();
      sectionHeadings.push(stripInlineMarkdown(headingMatch[1]));
      continue;
    }

    if (/^[-*]\s+/.test(line) || /^\d+\.\s+/.test(line)) {
      flushParagraph();
      bulletCount += 1;
      paragraphs.push(stripInlineMarkdown(line.replace(/^([-*]|\d+\.)\s+/, '')));
      continue;
    }

    if (/^>\s?/.test(line)) {
      flushParagraph();
      paragraphs.push(stripInlineMarkdown(line.replace(/^>\s?/, '')));
      continue;
    }

    if (/^#\s+/.test(line)) {
      flushParagraph();
      continue;
    }

    currentParagraph.push(line.trim());
  }

  flushParagraph();

  const wordCount = countWords(stripInlineMarkdown(markdown.replace(/```[\s\S]*?```/g, ' ')));
  const introWordCount = paragraphs.length ? countWords(paragraphs[0]) : 0;
  const longParagraphCount = paragraphs.filter((paragraph) => countWords(paragraph) > 90).length;

  return {
    wordCount,
    paragraphCount: paragraphs.length,
    introWordCount,
    longParagraphCount,
    bulletCount,
    codeFenceCount,
    sectionHeadings,
  };
}

export function auditMediumDraft(input: MediumDraftAuditInput): MediumDraftAuditResult {
  const title = normalizeWhitespace(input.title);
  const subtitle = normalizeWhitespace(input.subtitle || '');
  const seoTitle = normalizeWhitespace(input.seoTitle || '');
  const seoDescription = normalizeWhitespace(input.seoDescription || '');
  const normalizedTags = normalizeTags(input.tags);
  const markdownStats = analyzeMarkdown(input.markdown);
  const issues: MediumDraftAuditIssue[] = [];

  let hookScore = 34;
  let scanabilityScore = 33;
  let distributionScore = 33;

  if (title.length < 35 || title.length > 95) {
    issues.push({
      code: 'title_length_out_of_range',
      severity: 'info',
      message: 'The title length is weak for a strong Medium hook.',
      recommendedAction: 'Tighten the title so it stays concrete and specific without becoming bloated.'
    });
    hookScore -= 8;
  }

  if (!subtitle) {
    issues.push({
      code: 'missing_subtitle',
      severity: 'warning',
      message: 'The draft has no subtitle or dek.',
      recommendedAction: 'Add a subtitle that explains the payoff, audience, or outcome in one sentence.'
    });
    hookScore -= 12;
  } else if (subtitle.length < 45 || subtitle.length > 160) {
    issues.push({
      code: 'subtitle_length_out_of_range',
      severity: 'info',
      message: 'The subtitle length is outside a good skimmable range.',
      recommendedAction: 'Keep the subtitle crisp while still naming the result or reader payoff.'
    });
    hookScore -= 6;
  }

  if (markdownStats.introWordCount < 20) {
    issues.push({
      code: 'intro_too_short',
      severity: 'warning',
      message: 'The opening paragraph is too thin to cash in the click.',
      recommendedAction: 'Expand the opening so it states the problem, result, and why the reader should care.'
    });
    hookScore -= 8;
    scanabilityScore -= 4;
  }

  if (markdownStats.sectionHeadings.length < 3) {
    issues.push({
      code: 'not_enough_sections',
      severity: 'info',
      message: 'The draft does not have enough section breaks for easy scanning.',
      recommendedAction: 'Add more meaningful H2 sections so the article reads as a guided walkthrough instead of a wall of text.'
    });
    scanabilityScore -= 8;
  }

  if (markdownStats.longParagraphCount > 0) {
    issues.push({
      code: 'long_paragraphs',
      severity: 'info',
      message: 'One or more paragraphs are too long for comfortable Medium reading.',
      recommendedAction: 'Split long paragraphs into shorter units and use bullets where the reader benefits from chunking.'
    });
    scanabilityScore -= Math.min(10, markdownStats.longParagraphCount * 3);
  }

  if (markdownStats.bulletCount < 2) {
    issues.push({
      code: 'few_list_breaks',
      severity: 'info',
      message: 'The draft has very few bullets or numbered steps.',
      recommendedAction: 'Use bullets for takeaways, trade-offs, checklists, or step sequences so readers can scan faster.'
    });
    scanabilityScore -= 5;
  }

  if (!input.hasCoverImage) {
    issues.push({
      code: 'missing_cover_image',
      severity: 'info',
      message: 'No cover image is attached to the draft package.',
      recommendedAction: 'Add a strong 16:9 cover image so previews and social shares look deliberate.'
    });
    distributionScore -= 6;
  }

  if (normalizedTags.length < 3) {
    issues.push({
      code: 'too_few_tags',
      severity: 'info',
      message: 'The draft uses too few tags for broad but relevant topic distribution.',
      recommendedAction: 'Aim for three to five genuinely relevant tags, ordered from strongest topic to more specific supporting tags.'
    });
    distributionScore -= 8;
  }

  if (seoTitle && seoTitle !== title && seoTitle.length < 25) {
    issues.push({
      code: 'weak_seo_title',
      severity: 'info',
      message: 'The SEO title diverges from the display title but does not look strong enough to justify the split.',
      recommendedAction: 'Either align the SEO title with the article title or make the difference clearly useful for discovery.'
    });
    distributionScore -= 3;
  }

  if (!seoDescription) {
    issues.push({
      code: 'missing_seo_description',
      severity: 'warning',
      message: 'The draft package is missing an SEO description.',
      recommendedAction: 'Set a concise 140 to 160 character description that restates the benefit and topic clearly.'
    });
    distributionScore -= 7;
  } else if (seoDescription.length < 90 || seoDescription.length > 170) {
    issues.push({
      code: 'seo_description_length_out_of_range',
      severity: 'info',
      message: 'The SEO description length is outside a healthy preview range.',
      recommendedAction: 'Keep the description concise enough to preview cleanly while still naming the result and topic.'
    });
    distributionScore -= 4;
  }

  const subscores = {
    hook: clamp(hookScore, 0, 34),
    scanability: clamp(scanabilityScore, 0, 33),
    distribution: clamp(distributionScore, 0, 33)
  };
  const score = subscores.hook + subscores.scanability + subscores.distribution;
  const suggestionSet = new Set<string>();

  issues.forEach((issue) => suggestionSet.add(issue.recommendedAction));

  if (markdownStats.codeFenceCount > 0 && markdownStats.sectionHeadings.length < 4) {
    suggestionSet.add('When the post includes code, add more section framing around the excerpts so readers understand the story before and after each block.');
  }

  if (markdownStats.wordCount < 600) {
    suggestionSet.add('Consider expanding the article with one more concrete example, trade-off, or walkthrough step so the write-up feels substantial rather than note-sized.');
  }

  return {
    score,
    wordCount: markdownStats.wordCount,
    estimatedReadMinutes: Math.max(1, Math.ceil(markdownStats.wordCount / 220)),
    sectionHeadings: markdownStats.sectionHeadings,
    normalizedTags,
    subscores,
    issues,
    suggestions: [...suggestionSet]
  };
}
