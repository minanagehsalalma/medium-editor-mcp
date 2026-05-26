# Content Workflows

The content layer exists because writing to Medium is only half the problem. The other half is turning rough source material into a draft that survives Medium's formatting and preview behavior.

## Current pipeline

1. import the source, usually a GitHub gist
2. extract useful metadata, code, and any inline images
3. generate a Medium-oriented package:
   - title
   - subtitle
   - SEO title
   - SEO description
   - tag suggestions
4. audit the package
5. optimize the package and article structure
6. write the result through the legacy editor

## Quality fixes already baked in

- direct, more operational article scaffolds instead of generic thought-leadership cadence
- gist image carry-through when the source asset is fetchable
- clickable links preserved in the Medium body
- title/dek written into the correct Medium paragraph types
- simple markdown tables converted to readable Medium blocks
- local image-path upload support for cover and in-body visuals

## Practical rule

If a source asset is:

- executable or copyable text, keep it as real code
- a screenshot that explains a step, place it where that step is explained
- a decorative or throwaway visual, do not let it bloat the draft

That rule came out of real iteration on the article pipeline and is now part of the repo's expected behavior.
