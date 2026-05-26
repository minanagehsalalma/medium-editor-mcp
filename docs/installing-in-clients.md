# Installing In Codex And Other MCP Clients

This repo runs as a local **stdio MCP server**.

Build it first:

```bash
npm install
npm run build
```

On Windows, the MCP entrypoint is usually:

```text
node E:\path\to\medium-editor-mcp\dist\index.js
```

## Codex

OpenAI's docs show that Codex supports MCP in the CLI and IDE extension, and that the shared config lives in `~/.codex/config.toml`. The official docs also show `codex mcp add ...` for adding servers and `codex mcp list` for verifying them.

For this repo, the direct config shape is:

```toml
[mcp_servers.mediumEditor]
command = "node"
args = ["E:\\path\\to\\medium-editor-mcp\\dist\\index.js"]
```

Then verify:

```bash
codex mcp list
```

If you want the tool to be selected more reliably, add a short rule in your local `AGENTS.md`:

```text
Use the mediumEditor MCP server for Medium draft creation, Medium post repair, Medium GraphQL discovery, and gist-to-Medium workflows.
```

## VS Code Agent Mode

OpenAI's docs for MCP also show a project-local `.vscode/mcp.json` pattern for Agent Mode.

For this repo, the equivalent local config is:

```json
{
  "servers": {
    "mediumEditor": {
      "type": "stdio",
      "command": "node",
      "args": ["E:\\path\\to\\medium-editor-mcp\\dist\\index.js"]
    }
  }
}
```

Save that as:

```text
.vscode/mcp.json
```

## Cursor

OpenAI's MCP docs show Cursor using `mcp.json` with an `mcpServers` object. A practical local config for this repo is:

```json
{
  "mcpServers": {
    "mediumEditor": {
      "command": "node",
      "args": ["E:\\path\\to\\medium-editor-mcp\\dist\\index.js"]
    }
  }
}
```

Recommended locations:

- project-local: `.cursor/mcp.json`
- global: `%USERPROFILE%\\.cursor\\mcp.json`

## Generic stdio clients

If your client supports local stdio MCP servers, point it at:

- command: `node`
- args: `["E:\\path\\to\\medium-editor-mcp\\dist\\index.js"]`

That is the only part that matters.

## First-run order

Once the client can see the server, use this order:

1. `setup-medium-session`
2. `doctor-medium-mcp`
3. `test-medium-write-path`

That sequence catches bad cookies, bad transport assumptions, and write-path failures before you trust a publish workflow.

## Example config files

Ready-to-copy examples live in:

- [`examples/clients/codex.config.toml`](../examples/clients/codex.config.toml)
- [`examples/clients/vscode.mcp.json`](../examples/clients/vscode.mcp.json)
- [`examples/clients/cursor.mcp.json`](../examples/clients/cursor.mcp.json)

## Sources

- OpenAI MCP docs for Codex, VS Code Agent Mode, and Cursor: https://platform.openai.com/docs/docs-mcp
