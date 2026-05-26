# Repo Scope

This repo sits between research and tooling.

It is not just a content publisher, and it is not just a reverse-engineering notebook. The value is in joining the two:

- observe Medium's real editor behavior
- capture or derive verified request shapes
- expose them as reusable MCP tools
- apply them to practical article workflows

## What belongs here

- verified Medium editor request paths
- session and transport diagnostics
- draft/post repair workflows
- content-generation helpers that are grounded in the verified editor behavior
- docs that separate confirmed behavior from assumptions

## What does not belong here

- fake full-CRUD claims based on the archived public API
- undocumented mutation shapes invented without evidence
- browser-only solutions presented as if they are the primary design
- low-trust "growth hack" copy that has nothing to do with Medium's actual editor mechanics

## Quality bar

Every new workflow should answer three questions clearly:

1. What surface is this using: REST, GraphQL, or legacy delta?
2. Was the request shape observed, derived from verified behavior, or guessed?
3. How does a caller verify that the result really worked?
