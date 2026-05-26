import type { ImportedGist, ImportedGistFile } from './gist';

export interface MediumDraftStrategy {
  coverImageBrief: string;
  distributionChecklist: string[];
  editorialChecklist: string[];
  openingHook: string;
  readerPromise: string;
  recommendedTagOrder: string[];
  suggestedSeoDescription: string;
  suggestedSeoTitle: string;
  suggestedSubtitle: string;
}

export interface MediumPostAppealAssessment {
  issues: Array<{
    code: string;
    message: string;
    recommendedAction: string;
    severity: 'info' | 'warning';
  }>;
  signals: {
    hasPreviewImage: boolean;
    introWordCount: number;
    publicDescriptionLength: number | null;
    subtitleLength: number | null;
    titleLength: number;
  };
}

interface BuildDraftStrategyInput {
  angle?: string;
  audience?: string;
  gist: Pick<ImportedGist, 'canonicalUrl' | 'description' | 'files' | 'images' | 'ownerLogin' | 'primaryFile' | 'suggestedTitle'>;
  suggestedTags: string[];
}

interface AnalyzeMediumPostAppealInput {
  hasPreviewImage: boolean;
  intro: string | null;
  publicDescription: string | null;
  subtitle: string | null;
  title: string | null;
}

interface SuggestMediumTagsFromTextInput {
  audience?: string;
  existingTags?: string[];
  markdown?: string;
  subtitle?: string;
  text?: string;
  title?: string;
}

const languageTagMap = new Map<string, string>([
  ['bash', 'Bash'],
  ['c', 'C Programming'],
  ['c#', 'C#'],
  ['cpp', 'C++'],
  ['css', 'CSS'],
  ['dockerfile', 'Docker'],
  ['go', 'Go'],
  ['graphql', 'GraphQL'],
  ['html', 'HTML'],
  ['java', 'Java'],
  ['javascript', 'JavaScript'],
  ['json', 'JSON'],
  ['kotlin', 'Kotlin'],
  ['markdown', 'Documentation'],
  ['php', 'PHP'],
  ['powershell', 'PowerShell'],
  ['python', 'Python'],
  ['ruby', 'Ruby'],
  ['rust', 'Rust'],
  ['shell', 'Shell'],
  ['sql', 'SQL'],
  ['swift', 'Swift'],
  ['tsx', 'React'],
  ['typescript', 'TypeScript'],
  ['yaml', 'DevOps'],
  ['yml', 'DevOps']
]);

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

function toTitleCase(value: string) {
  return value.replace(/\b([a-z])/g, (character) => character.toUpperCase());
}

function stripTrailingPunctuation(value: string) {
  return value.replace(/[.?!:;,\-–—\s]+$/g, '').trim();
}

function inferKeywordTags(files: ImportedGistFile[], description: string | null, primaryFile: ImportedGistFile | null) {
  const corpus = [
    description || '',
    primaryFile?.filename || '',
    ...files.map((file) => `${file.filename} ${file.language || ''}`)
  ].join(' ').toLowerCase();

  const tags: string[] = [];

  if (/\b(auth|jwt|oauth|session|token)\b/.test(corpus)) {
    tags.push('Authentication');
  }

  if (/\b(api|rest|graphql|http|webhook)\b/.test(corpus)) {
    tags.push('APIs');
  }

  if (/\b(cli|terminal|powershell|shell|bash)\b/.test(corpus)) {
    tags.push('Command Line');
  }

  if (/\b(docker|kubernetes|terraform|deployment|ci|cd|pipeline)\b/.test(corpus)) {
    tags.push('DevOps');
  }

  if (/\b(react|next\.?js|frontend|ui|component)\b/.test(corpus)) {
    tags.push('Web Development');
  }

  if (/\b(test|jest|playwright|cypress|vitest|pytest)\b/.test(corpus)) {
    tags.push('Testing');
  }

  if (/\b(security|cve|exploit|xss|csrf|ssrf|auth bypass|rce)\b/.test(corpus)) {
    tags.push('Cybersecurity');
  }

  return tags;
}

function inferKeywordTagsFromText(text: string) {
  const corpus = text.toLowerCase();
  const tags: string[] = [];

  if (/\b(auth|jwt|oauth|session|token)\b/.test(corpus)) {
    tags.push('Authentication');
  }

  if (/\b(api|rest|graphql|http|webhook)\b/.test(corpus)) {
    tags.push('APIs');
  }

  if (/\b(cli|terminal|powershell|shell|bash)\b/.test(corpus)) {
    tags.push('Command Line');
  }

  if (/\b(docker|kubernetes|terraform|deployment|ci|cd|pipeline)\b/.test(corpus)) {
    tags.push('DevOps');
  }

  if (/\b(react|next\.?js|frontend|ui|component)\b/.test(corpus)) {
    tags.push('Web Development');
  }

  if (/\b(test|jest|playwright|cypress|vitest|pytest)\b/.test(corpus)) {
    tags.push('Testing');
  }

  if (/\b(security|cve|exploit|xss|csrf|ssrf|auth bypass|rce|admin|vulnerability)\b/.test(corpus)) {
    tags.push('Cybersecurity');
  }

  if (/\b(typescript|tsconfig|ts-jest|ts-node)\b/.test(corpus)) {
    tags.push('TypeScript');
  }

  if (/\b(javascript|node\.?js|npm|pnpm|yarn)\b/.test(corpus)) {
    tags.push('JavaScript');
  }

  if (/\b(python|pytest|fastapi|django|flask)\b/.test(corpus)) {
    tags.push('Python');
  }

  if (/\b(git|github|gist|repo|repository)\b/.test(corpus)) {
    tags.push('Developer Tools');
  }

  return tags;
}

function buildSuggestedTags(files: ImportedGistFile[], description: string | null, angle?: string, audience?: string) {
  const rankedTags: string[] = [];

  files.forEach((file) => {
    const language = file.language?.trim().toLowerCase();
    if (!language) {
      return;
    }

    const mapped = languageTagMap.get(language) || toTitleCase(language);
    if (!rankedTags.includes(mapped)) {
      rankedTags.push(mapped);
    }
  });

  inferKeywordTags(files, description, files[0] || null).forEach((tag) => {
    if (!rankedTags.includes(tag)) {
      rankedTags.push(tag);
    }
  });

  const audienceText = `${angle || ''} ${audience || ''}`.toLowerCase();
  if (/\b(beginner|new to|intro)\b/.test(audienceText) && !rankedTags.includes('Programming')) {
    rankedTags.push('Programming');
  }

  if (!rankedTags.includes('Software Engineering')) {
    rankedTags.push('Software Engineering');
  }

  if (rankedTags.length < 3 && !rankedTags.includes('Programming')) {
    rankedTags.push('Programming');
  }

  if (rankedTags.length < 3 && !rankedTags.includes('Developer Tools')) {
    rankedTags.push('Developer Tools');
  }

  return rankedTags.slice(0, 5);
}

function buildReaderPromise(title: string, angle?: string, audience?: string) {
  const parts = [
    `Keep the article focused on ${title.toLowerCase()}.`,
    angle ? `Bias the explanation toward ${normalizeWhitespace(angle)}.` : 'Bias the explanation toward the actual fix.',
    audience ? `Write for ${normalizeWhitespace(audience)}.` : 'Write for engineers who want to reuse the work quickly.'
  ];

  return parts.join(' ');
}

function buildSuggestedSubtitle(title: string, description: string | null, primaryFile: ImportedGistFile | null, angle?: string) {
  const base = description?.trim()
    || (primaryFile ? `A direct breakdown of ${primaryFile.filename} and the part that actually matters.` : '');
  const angleClause = angle ? ` Focus on ${stripTrailingPunctuation(angle)}.` : '';
  return truncateText(`${stripTrailingPunctuation(title)}${base ? ': ' : ''}${stripTrailingPunctuation(base)}${angleClause}`, 140);
}

function buildOpeningHook(title: string, description: string | null, primaryFile: ImportedGistFile | null, angle?: string) {
  const firstSentence = description?.trim()
    || (primaryFile
      ? `${primaryFile.filename} is the anchor for the implementation, so open with the problem it solves and the result it produced.`
      : 'Open with the practical situation, the fix, and the result.');
  const angleSentence = angle
    ? `Frame it around ${stripTrailingPunctuation(angle)}.`
    : 'Open with what changed, what worked, or what stopped breaking.';

  return truncateText(`${firstSentence} ${angleSentence}`, 220);
}

function buildCoverImageBrief(gist: BuildDraftStrategyInput['gist']) {
  const primaryName = gist.primaryFile?.filename || 'the key file';
  const owner = gist.ownerLogin ? ` from @${gist.ownerLogin}` : '';
  return truncateText(
    `Use a clean 16:9 editorial poster image for ${primaryName}${owner}. Avoid generic desk scenes. Show the actual tool, system, or payoff from the title with one dominant focal point and strong contrast.`,
    220
  );
}

export function suggestMediumTags(
  files: ImportedGistFile[],
  description: string | null,
  angle?: string,
  audience?: string
) {
  return buildSuggestedTags(files, description, angle, audience);
}

export function suggestMediumTagsFromText(input: SuggestMediumTagsFromTextInput) {
  const rankedTags: string[] = [];
  const pushUnique = (tag: string) => {
    if (tag && !rankedTags.includes(tag)) {
      rankedTags.push(tag);
    }
  };

  (input.existingTags || []).forEach((tag) => pushUnique(normalizeWhitespace(tag)));
  inferKeywordTagsFromText(
    [input.title || '', input.subtitle || '', input.text || '', input.markdown || ''].join(' ')
  ).forEach(pushUnique);

  const audienceText = `${input.audience || ''} ${input.text || ''}`.toLowerCase();
  if (/\b(beginner|new to|intro)\b/.test(audienceText)) {
    pushUnique('Programming');
  }

  pushUnique('Software Engineering');

  if (rankedTags.length < 3) {
    pushUnique('Programming');
  }

  if (rankedTags.length < 3) {
    pushUnique('Developer Tools');
  }

  return rankedTags.slice(0, 5);
}

export function buildMediumDraftStrategy(input: BuildDraftStrategyInput): MediumDraftStrategy {
  const suggestedSubtitle = buildSuggestedSubtitle(
    input.gist.suggestedTitle,
    input.gist.description,
    input.gist.primaryFile,
    input.angle
  );
  const suggestedSeoTitle = truncateText(input.gist.suggestedTitle, 70);
  const suggestedSeoDescription = truncateText(
    input.gist.description?.trim()
      || `${suggestedSubtitle} Source: ${input.gist.canonicalUrl}.`,
    155
  );

  return {
    suggestedSubtitle,
    suggestedSeoTitle,
    suggestedSeoDescription,
    openingHook: buildOpeningHook(input.gist.suggestedTitle, input.gist.description, input.gist.primaryFile, input.angle),
    readerPromise: buildReaderPromise(input.gist.suggestedTitle, input.angle, input.audience),
    coverImageBrief: buildCoverImageBrief(input.gist),
    recommendedTagOrder: input.suggestedTags,
    editorialChecklist: [
      'Lead with the concrete problem and the payoff in the first 1 to 3 lines.',
      'Keep paragraphs short and make every section heading carry meaning on its own.',
      'Show one code excerpt at a time and explain why it matters before moving on.',
      'Cut any sentence that sounds like generic inspiration instead of an actual engineering note.'
    ],
    distributionChecklist: [
      'Use all five tags only when each one is genuinely relevant, with the strongest topic first.',
      'Pair the post with a 16:9 cover image instead of a raw screenshot dump.',
      'Keep the title, subtitle, and SEO description aligned so Medium previews do not feel inconsistent.',
      'Leave responses enabled when discussion is useful for reach and credibility.'
    ]
  };
}

export function assessMediumPostAppeal(input: AnalyzeMediumPostAppealInput): MediumPostAppealAssessment {
  const title = input.title?.trim() || '';
  const subtitle = input.subtitle?.trim() || '';
  const intro = input.intro?.trim() || '';
  const publicDescription = input.publicDescription?.trim() || '';
  const issues: MediumPostAppealAssessment['issues'] = [];
  const introWordCount = intro ? intro.split(/\s+/).filter(Boolean).length : 0;

  if (title.length > 90 || title.length < 35) {
    issues.push({
      code: 'title_length_out_of_range',
      severity: 'info',
      message: 'The title length is outside the usual click-through sweet spot for Medium-style social previews.',
      recommendedAction: 'Aim for a title that is concrete and specific without sprawling beyond roughly 90 characters.'
    });
  }

  if (!subtitle) {
    issues.push({
      code: 'missing_subtitle',
      severity: 'warning',
      message: 'The post is missing a strong subtitle or dek.',
      recommendedAction: 'Add a subtitle that explains the payoff, audience, or result in one crisp sentence.'
    });
  } else if (subtitle.length > 160 || subtitle.length < 50) {
    issues.push({
      code: 'subtitle_length_out_of_range',
      severity: 'info',
      message: 'The subtitle length looks weak for a skimmable Medium preview.',
      recommendedAction: 'Keep the subtitle tight enough to scan quickly while still explaining the article payoff.'
    });
  }

  if (introWordCount > 0 && introWordCount < 18) {
    issues.push({
      code: 'intro_too_thin',
      severity: 'info',
      message: 'The opening paragraph may be too thin to justify the click after the headline.',
      recommendedAction: 'Expand the intro so it states the problem, the result, and why the reader should care.'
    });
  }

  if (!input.hasPreviewImage) {
    issues.push({
      code: 'missing_preview_image',
      severity: 'info',
      message: 'The post does not appear to have a preview image attached.',
      recommendedAction: 'Add a strong 16:9 cover image so the post presents better in Medium previews and social shares.'
    });
  }

  if (!publicDescription) {
    issues.push({
      code: 'missing_public_description',
      severity: 'warning',
      message: 'The public page does not currently expose a meta description.',
      recommendedAction: 'Sync or set the SEO description so previews carry a clear reason to click.'
    });
  }

  return {
    signals: {
      titleLength: title.length,
      subtitleLength: subtitle ? subtitle.length : null,
      introWordCount,
      hasPreviewImage: input.hasPreviewImage,
      publicDescriptionLength: publicDescription ? publicDescription.length : null
    },
    issues
  };
}
