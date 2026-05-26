# Medium Editor Research

## High-level map

Medium automation currently breaks into three useful layers:

### 1. Archived REST API

Still useful for:

- profile lookup
- publications lookup
- publication contributors
- create-post publishing

Not enough for:

- modern post settings
- rich editor parity
- draft-state surgery

### 2. GraphQL editor surfaces

Observed on:

- writer/outbox
- post settings
- publish/submission flow
- share key creation

Good fit for:

- metadata changes
- tags
- canonical URL
- SEO fields
- publish-flow defaults
- visibility-adjacent settings where the mutation contract is captured

### 3. Legacy delta editor

Still responsible for:

- body writing
- paragraph structure
- images in the body
- code blocks
- headings
- lists

This is why the repo still needs legacy delta tooling even after the GraphQL research.

## Operational lessons

- Session health must be checked first.
- Cookie presence alone does not prove write readiness.
- Browser-like request parity can matter.
- Cloudflare can temporarily block otherwise valid sessions.
- Markdown support should be translated into Medium-native structures before writing.

## Evidence discipline

When adding a new editor workflow:

1. capture the real request or derive it from observed behavior
2. verify the effect on the draft/post state
3. document the boundary clearly

That is how this repo avoids drifting back into overclaiming.
