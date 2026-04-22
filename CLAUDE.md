# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build Commands

```bash
npm run build      # Compile TypeScript to dist/
npm run bundle     # Create single-file distribution in dist/dragon.js
npm run dev        # Run with ts-node in development
npm run start      # Run compiled version from dist/
npm run lint       # Run ESLint on source files
```

## Architecture

Dragon is a multi-provider AI CLI tool built in TypeScript with an ESM module system. The architecture consists of three main layers:

### Provider Layer (`src/providers/`)
- **Base abstraction**: `BaseProvider` abstract class in [base.ts](src/providers/base.ts) defines the interface for all AI providers. Each provider implements `chat()` for single responses and `stream()` for streaming responses.
- **Provider pattern**: New providers extend `BaseProvider` and implement message formatting specific to their API. See [anthropic.ts](src/providers/anthropic.ts) as a reference implementation.
- **Factory function**: `createProvider()` in [index.ts](src/providers/index.ts) instantiates the correct provider based on config.
- **Supported providers**: OpenAI, Anthropic, Gemini, DeepSeek, and Chinese LLMs (Qwen, Moonshot, Yi, Doubao) via OpenAI-compatible APIs.

### Tool Layer (`src/tools/`)
- **Tool interface**: `BaseTool` abstract class in [base.ts](src/tools/base.ts). Each tool implements `name`, `description`, `parameters` (Zod schema), and `execute()`.
- **Tool execution flow**: Tools receive parameters and a `ToolContext` (working directory, permissions). Results include `success`, `output`, and optional `error`.
- **Registry pattern**: `ToolRegistry` in [index.ts](src/tools/index.ts) manages tool registration and execution. Use `getToolDefinitions()` to get tool schemas for the AI model.

### Configuration (`src/config/`)
- **Schema-driven**: Configuration schema in [schema.ts](src/config/schema.ts) uses Zod for validation. Provider configs include `apiKey`, `baseUrl`, `models`, and `defaultModel`.
- **Config location**: `~/.dragon/config.json`. Create with `dragon init`.

### REPL (`src/repl.ts`)
- Handles interactive chat loop, parses REPL commands (`/help`, `/clear`, `/model`, etc.)
- Manages message history and orchestrates tool execution during AI conversations
- Handles both interactive TTY input and piped input

## Key Data Flow

1. User message → REPL adds to message history
2. `provider.stream()` yields chunks (text or tool_use)
3. When tool_use received: tool execution via `ToolRegistry.executeToolCall()`
4. Tool results formatted as `tool_result` content blocks, appended to messages
5. Loop continues until AI returns with no tool calls

## Adding a New Provider

1. Create file in `src/providers/` extending `BaseProvider`
2. Implement `chat()` and `stream()` methods with proper message formatting for the API
3. Add to `createProvider()` factory in [src/providers/index.ts](src/providers/index.ts)
4. Add default config in [src/config/schema.ts](src/config/schema.ts)

## Adding a New Tool

1. Create file in `src/tools/` extending `BaseTool`
2. Define Zod schema for parameters
3. Implement `execute()` method
4. Register in `ToolRegistry.registerDefaultTools()` in [src/tools/index.ts](src/tools/index.ts)
