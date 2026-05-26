import { auditMediumDraft } from '../src/medium-draft-audit';

describe('auditMediumDraft', () => {
  it('scores a well-structured draft with strong packaging', () => {
    const result = auditMediumDraft({
      title: 'How We Turned a Tiny TypeScript Retry Helper Into a Reusable Production Pattern',
      subtitle: 'A practical walkthrough of the utility, the edge cases it handles, and where the abstraction starts paying for itself.',
      markdown: [
        '# How We Turned a Tiny TypeScript Retry Helper Into a Reusable Production Pattern',
        '',
        'The hard part is not writing a retry loop. The hard part is making it predictable enough that other engineers will actually trust it in production.',
        '',
        '## Why this matters',
        '',
        'Teams keep rewriting the same retry logic because tiny helpers usually hide the trade-offs that matter under pressure.',
        '',
        '## How it works',
        '',
        '- Start with the call contract.',
        '- Separate retry policy from the execution wrapper.',
        '- Make backoff and stop conditions explicit.',
        '',
        '## Code walkthrough',
        '',
        '```typescript',
        'export const retry = async () => true;',
        '```',
        '',
        '## Trade-offs',
        '',
        'This pattern is easy to reuse, but it still needs service-specific timeout and idempotency decisions.',
        ''
      ].join('\n'),
      tags: ['TypeScript', 'Software Engineering', 'Testing', 'APIs'],
      seoTitle: 'How We Turned a Tiny TypeScript Retry Helper Into a Reusable Production Pattern',
      seoDescription: 'A practical TypeScript retry pattern walkthrough with edge cases, trade-offs, and reusable engineering guidance.',
      hasCoverImage: true
    });

    expect(result.score).toBeGreaterThanOrEqual(85);
    expect(result.estimatedReadMinutes).toBeGreaterThanOrEqual(1);
    expect(result.issues.map((issue) => issue.code)).not.toContain('missing_subtitle');
    expect(result.sectionHeadings).toEqual(['Why this matters', 'How it works', 'Code walkthrough', 'Trade-offs']);
  });

  it('flags weak packaging and missing distribution basics', () => {
    const result = auditMediumDraft({
      title: 'retry',
      markdown: 'Short intro.\n\nSome text with no real sectioning.',
      tags: ['TypeScript'],
      hasCoverImage: false
    });

    expect(result.score).toBeLessThan(75);
    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        'title_length_out_of_range',
        'missing_subtitle',
        'intro_too_short',
        'not_enough_sections',
        'too_few_tags',
        'missing_cover_image',
        'missing_seo_description'
      ])
    );
  });
});
