# Contributing

## What helps most

- verified Medium request shapes
- tighter session or transport diagnostics
- cleaner draft writing behavior
- evidence-backed fixes for real Medium post failures
- docs that separate confirmed behavior from assumptions

## Ground rules

1. Do not add undocumented Medium mutations unless you can show where they came from.
2. Prefer direct editor surfaces over browser-only workarounds.
3. Keep examples sanitized. No real cookies, tokens, or account-specific paths.
4. Add or update tests when behavior changes.

## Local dev

```bash
npm install
npm run build
npm test -- --runInBand
```

## Pull request bar

- explain which Medium surface the change uses: REST, GraphQL, or legacy delta
- explain whether the request shape was observed, derived, or already registered
- mention how the result was verified
