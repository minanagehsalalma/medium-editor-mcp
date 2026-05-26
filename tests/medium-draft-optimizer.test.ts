import { optimizeMediumDraftPackage } from '../src/medium-draft-optimizer';

describe('optimizeMediumDraftPackage', () => {
  it('rewrites a weak package into a stronger one with a better audit score', () => {
    const result = optimizeMediumDraftPackage({
      title: 'retry',
      markdown: [
        '# retry',
        '',
        'Short intro.',
        '',
        '## Code',
        '',
        '```typescript',
        'export const retry = async () => true;',
        '```',
        ''
      ].join('\n'),
      tags: ['TypeScript'],
      hasCoverImage: false
    });

    expect(result.optimized.title.length).toBeGreaterThan('retry'.length);
    expect(result.optimized.subtitle.length).toBeGreaterThan(8);
    expect(result.optimized.tags.length).toBeGreaterThanOrEqual(3);
    expect(result.auditAfter.score).toBeGreaterThan(result.auditBefore.score);
    expect(result.optimized.markdown).toContain(result.optimized.intro);
    expect(result.optimized.intro).not.toContain('The useful part is understanding');
    expect(result.optimized.subtitle).not.toContain('A practical breakdown');
  });
});
