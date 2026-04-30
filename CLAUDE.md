# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Test Commands

```bash
npm run build           # Compile TypeScript to dist/
npm run bundle          # Create single-file dist in dist/dragon.js
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
- Reference: [anthropic.ts](src/providers/anthropic.ts) for Anthropic API, [openai.ts](src/providers/openai.ts) for OpenAI, [chinese.ts](src/providers/chinese.ts) for OpenAI-compatible Chinese LLMs.

### Tool Layer (`src/tools/`)
- **BaseTool** in [base.ts](src/tools/base.ts): abstract class with `name`, `description`, `parameters` (Zod), `execute(params, context?)`. Also provides `resolvePath()` for path-traversal-safe file resolution (allows working dir, home dir, temp dir; blocks system paths like `/etc/shadow`).
- **ToolRegistry** in [index.ts](src/tools/index.ts): manages registration, execution, and limits (per-turn: 25, session: 200, output: 100KB). `executeToolCall()` enforces limits and truncates oversized output.
- Built-in tools: Bash, Read, Write, Edit, Glob, Grep, WebFetch, WebSearch, Agent.

### Configuration (`src/config/`)
- **Schema** in [schema.ts](src/config/schema.ts): Zod schemas for `ProviderConfig` (apiKey, baseUrl, models, defaultModel) and `DragonConfig` (defaultProvider, providers map, tools).
- **Loader** in [loader.ts](src/config/loader.ts): `loadConfig()`, `initConfig()`, `saveConfig()`, `validateConfig()`. Handles encrypted config decryption via `secureConfigManager`.
- **Config location**: `~/.dragon/config.json`. Encrypted configs need `DRAGON_PASSWORD` env var at runtime.

### Encryption (`src/encryption/`)
- `EncryptionService`: AES-256-GCM encryption with PBKDF2 key derivation (100K iterations). Master key stored at `~/.dragon/.key`.
- `SecureConfigManager`: recursively encrypts/decrypts fields named `apiKey`, `token`, `secret`, `password` in config objects.
- Global singletons: `encryptionService`, `secureConfigManager`.

### Error Handling (`src/utils/errors.ts`)
- Structured error hierarchy: `DragonError` (base) → `ConfigError`, `ProviderError`, `ToolError`, `FileSystemError`, `NetworkError`
- Numbered error codes by category (1xxx=config, 2xxx=provider, 3xxx=tool, 4xxx=filesystem, 5xxx=network)
- `wrapError()` utility for wrapping unknown errors into `DragonError`

### Logging & Performance (`src/utils/`)
- **Logger** (`logger.ts`): multi-level logger (DEBUG=0 through SILENT=4), controlled by `DRAGON_LOG_LEVEL` env var or `/debug` REPL command. Supports file output.
- **Performance** (`performance.ts` + `src/performance/`): `perfMonitor` singleton for timing operations. Enabled via `--monitor` flag or `DRAGON_PERF_MONITOR=true`.
- **Cost Tracker** (`cost-tracker.ts`): tracks token usage and cost across providers.

### REPL (`src/repl.ts`)
- Orchestrates the chat loop: loads config, creates provider, creates `ToolRegistry`, manages message history
- Handles `/help`, `/clear`, `/history`, `/provider`, `/model`, `/tools`, `/exit`, `/debug`, `/perf` commands
- On each turn: sends messages to `provider.stream()`, renders text chunks, accumulates tool calls, executes them via `ToolRegistry.executeToolCall()`, appends results, loops

## Key Data Flow

1. User input → REPL adds to message history as `{ role: 'user', content: '...' }`
2. `provider.stream(messages, tools, options)` yields `StreamChunk` objects (type: `text`, `thinking`, `tool_use`, `usage`)
3. When `tool_use` chunks arrive: tool execution via `ToolRegistry.executeToolCall()`
4. Tool results formatted as `{ role: 'tool', content: [{ type: 'tool_result', ... }] }`, appended to messages
5. Loop continues until provider yields a chunk with no tool calls (stop reason: `end_turn`)

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
