import { optimizeMediumArticleDraft } from '../src/medium-article-optimizer';

describe('optimizeMediumArticleDraft', () => {
  it('iteratively improves a weak article draft without injecting templated filler sections', () => {
    const result = optimizeMediumArticleDraft({
      title: 'retry',
      markdown: [
        '# retry',
        '',
        'Short intro.',
        '',
        '```typescript',
        'export const retry = async () => true;',
        '```',
        ''
      ].join('\n'),
      tags: ['TypeScript'],
      hasCoverImage: false,
      maxPasses: 3,
      minScore: 85
    });

    expect(result.finalAudit.score).toBeGreaterThanOrEqual(result.packageOptimization.auditAfter.score);
    expect(result.optimized.markdown).not.toContain('## Why this matters');
    expect(result.optimized.markdown).not.toContain('## Trade-offs and edge cases');
    expect(result.optimized.markdown).not.toContain('## Key takeaways');
    expect(result.optimized.markdown).not.toContain('## Implementation notes');
    expect(result.optimized.markdown).not.toContain('The useful part is understanding');
    expect(result.passes.length).toBeGreaterThan(0);
  });
});
