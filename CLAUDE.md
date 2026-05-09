# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Test Commands

```bash
npm run build           # Compile TypeScript to dist/
npm run dev             # Run directly with tsx
npm run start           # Run compiled version from dist/
npm run lint            # Run ESLint on all source files
npm test                # Run all tests with Vitest
npm run test:watch      # Run tests in watch mode
npm run test:coverage   # Run tests with coverage report (output: text + coverage/index.html)
npx vitest tests/unit/path/to/test.test.ts  # Run a single test file
```

Tests use Vitest with `globals: true`. Test files live in `tests/unit/` mirroring the `src/` structure. Vitest config is in `vitest.config.ts`.

## Architecture

Dragon is a multi-provider AI CLI tool built in TypeScript. **ESM module** (`"type": "module"` in package.json, `moduleResolution: "NodeNext"` in tsconfig) — all relative imports must use `.js` extensions (e.g., `import { foo } from './bar.js'`). Node.js >= 22 required.

### Entry Point & CLI (`src/index.ts`)
- Uses [Commander](https://www.npmjs.com/package/commander) for CLI parsing
- Subcommands: `init` (config setup, optionally with AES-256-GCM encryption), `config [show|edit|validate]`, `chat`
- Default action (no subcommand): loads config, shows banner, starts REPL
- Config loaded from `~/.dragon/config.json` via `loadConfig()` from `src/config/`

### Provider Layer (`src/providers/`)
- **Types defined in [base.ts](src/providers/base.ts)**: `AIProvider` interface, `BaseProvider` abstract class, plus shared types (`Message`, `ContentBlock`, `AIResponse`, `StreamChunk`, `ToolCall`, `ToolDefinition`, `ChatOptions`).
- Each provider implements `chat()` (single response) and `stream()` (async generator of `StreamChunk`).
- **Factory**: `createProvider()` in [index.ts](src/providers/index.ts) switches on provider name. Any provider with a `baseUrl` not matching known providers falls through to `ChineseProvider` (OpenAI-compatible API).
- Providers: [anthropic.ts](src/providers/anthropic.ts), [openai.ts](src/providers/openai.ts), [gemini.ts](src/providers/gemini.ts), [deepseek.ts](src/providers/deepseek.ts), [chinese.ts](src/providers/chinese.ts) (OpenAI-compatible Chinese LLMs: Qwen, Moonshot, Yi, Doubao).

### Tool Layer (`src/tools/`)
- **BaseTool** in [base.ts](src/tools/base.ts): abstract class with `name`, `description`, `parameters` (Zod), `execute(params, context?)`. Also provides `resolvePath()` for path-traversal-safe file resolution (allows working dir, home dir, temp dir; blocks system paths like `/etc/shadow`).
- **ToolRegistry** in [index.ts](src/tools/index.ts): manages registration, execution, and limits (per-turn: 25, session: 200, output: 100KB). `executeToolCall()` enforces limits and truncates oversized output.
- Built-in tools: Bash, Read, Write, Edit, Glob, Grep, WebFetch, WebSearch, Agent, Skill.
- **MCP integration**: [mcp-client.ts](src/tools/mcp-client.ts) manages connections to MCP servers (stdio, HTTP, SSE transports). [mcp-tool.ts](src/tools/mcp-tool.ts) wraps each MCP server tool as a `BaseTool` with `mcp:<server>:<tool>` naming.

### Configuration (`src/config/`)
- **Schema** in [schema.ts](src/config/schema.ts): Zod schemas for `ProviderConfig` (apiKey, baseUrl, models, defaultModel), `DragonConfig` (defaultProvider, providers map, tools, mcpServers, workspace, logging), and `McpServerConfig`.
- **Loader** in [loader.ts](src/config/loader.ts): `loadConfig()`, `initConfig()`, `saveConfig()`, `validateConfig()`. Handles encrypted config decryption via `secureConfigManager`.
- **Claude sync** in [claude-sync.ts](src/config/claude-sync.ts): auto-imports Anthropic API credentials from Claude CLI environment variables (`ANTHROPIC_BASE_URL`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_MODEL`, etc.) into Dragon's config at startup.
- **Config location**: `~/.dragon/config.json`. Encrypted configs need `DRAGON_PASSWORD` env var at runtime.

### Encryption (`src/encryption/`)
- `EncryptionService`: AES-256-GCM encryption with PBKDF2 key derivation (100K iterations). Master key stored at `~/.dragon/.key`.
- `SecureConfigManager`: recursively encrypts/decrypts fields named `apiKey`, `token`, `secret`, `password` in config objects.
- Global singletons: `encryptionService`, `secureConfigManager`.

### Skills System (`src/skills/`)
- **Types** in [types.ts](src/skills/types.ts): `SkillDefinition` interface (name, description, content, sourcePath) and Zod schema for YAML frontmatter validation.
- **Loader** in [loader.ts](src/skills/loader.ts): reads skill files from `~/.dragon/skills/` and built-in skills. Skills are markdown files with YAML frontmatter (`name`, `description`).
- **Builtin** in [builtin.ts](src/skills/builtin.ts): built-in skills shipped with Dragon.
- **SkillTool** in [skill-tool.ts](src/skills/skill-tool.ts): registered as `skill` tool — allows the AI to load, list, create, and update user-defined skills at runtime.

### REPL (`src/repl/`)
- [index.ts](src/repl/index.ts): main entry — initializes readline, loads config/skills/MCP, builds system prompt from CLAUDE.md + skills + autogen prompt, starts the chat loop.
- [chat-loop.ts](src/repl/chat-loop.ts): the core streaming loop — sends messages to `provider.stream()`, renders text chunks, accumulates tool calls, executes via `ToolRegistry`, handles token save levels and history compaction via `HistoryCompactor`.
- [commands.ts](src/repl/commands.ts): parses and dispatches REPL slash commands (`/help`, `/clear`, `/history`, `/provider`, `/model`, `/tools`, `/exit`, `/debug`, `/cost`, `/perf`, `/auto`, `/ask`, `/workspace`, `/save-tokens`, `/mcp`).
- [command-registry.ts](src/repl/command-registry.ts): metadata for tab-completion and hints (command names, aliases, descriptions, subcommands).
- [handlers.ts](src/repl/handlers.ts): workspace management commands and auto-skill generation logic.
- [config.ts](src/repl/config.ts): REPL constants (`AUTOGEN_PROMPT`, `TOKEN_SAVE_CONFIGS`, `SessionState`, `TokenSaveLevel`, `ReplOptions`).
- [prompts.ts](src/repl/prompts.ts): user-facing prompts (workspace init, tool confirmation).
- [input-queue.ts](src/repl/input-queue.ts): manages queued input for auto-generation flows.

### Error Handling (`src/utils/errors.ts`)
- Structured error hierarchy: `DragonError` (base) → `ConfigError`, `ProviderError`, `ToolError`, `FileSystemError`, `NetworkError`
- Numbered error codes by category (1xxx=config, 2xxx=provider, 3xxx=tool, 4xxx=filesystem, 5xxx=network)
- `wrapError()` utility for wrapping unknown errors into `DragonError`

### Logging & Performance (`src/utils/`)
- **Logger** (`logger.ts`): multi-level logger (DEBUG=0 through SILENT=4), controlled by `DRAGON_LOG_LEVEL` env var or `/debug` REPL command. Supports file output.
- **Performance** (`performance.ts` + `src/performance/`): `perfMonitor` singleton for timing operations. Enabled via `--monitor` flag or `DRAGON_PERF_MONITOR=true`.
- **Cost Tracker** (`cost-tracker.ts`): tracks token usage and cost across providers.
- **History Compactor** (`history-compactor.ts`): estimates token counts and compacts conversation history when approaching context limits (default max: 180K tokens, keeps last 20 messages minimum).

## Key Data Flow

1. User input → REPL adds to message history as `{ role: 'user', content: '...' }`
2. `provider.stream(messages, tools, options)` yields `StreamChunk` objects (type: `text`, `thinking`, `tool_use`, `usage`)
3. When `tool_use` chunks arrive: tool execution via `ToolRegistry.executeToolCall()`
4. Tool results formatted as `{ role: 'tool', content: [{ type: 'tool_result', ... }] }`, appended to messages
5. Loop continues until provider yields a chunk with no tool calls (stop reason: `end_turn`)
6. When estimated token count exceeds threshold, `HistoryCompactor` summarizes older messages to stay within context limits

## Adding a New Provider

1. Create file in `src/providers/` extending `BaseProvider`
2. Implement `chat()`, `stream()`, and set `name`, `apiKey`, `models`, `defaultModel`
3. Add case to `createProvider()` in [src/providers/index.ts](src/providers/index.ts)
4. Add default config in `DEFAULT_PROVIDERS` within [src/config/loader.ts](src/config/loader.ts)

## Adding a New Tool

1. Create file in `src/tools/` extending `BaseTool`
2. Define Zod schema for parameters
3. Implement `execute(params, context?)` returning `ToolExecuteResult`
4. Register in `ToolRegistry.registerDefaultTools()` in [src/tools/index.ts](src/tools/index.ts)
