# 🐉 Dragon - Multi-Provider AI CLI

[![npm version](https://badge.fury.io/js/opendragon.svg)](https://www.npmjs.com/package/opendragon)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/node/v/opendragon.svg)](https://nodejs.org/)

A powerful command-line AI tool supporting multiple providers, inspired by Claude Code.

## ✨ Features

- 🔄 **Multi-Provider Support**: Anthropic Claude, OpenAI, Google Gemini, DeepSeek, and Chinese LLMs (Qwen, Moonshot, Yi, Doubao)
- 💬 **REPL Interface**: Interactive chat with streaming responses
- 🛠️ **Tool System**: Execute commands, read/write files, search code, web fetch, and more
- 🤖 **Agent Support**: Spawn sub-agents for complex tasks
- 🔐 **Encryption**: AES-256-GCM encryption for API keys and sensitive fields
- ⚡ **Performance Monitoring**: Built-in timing and cost tracking
- ⚙️ **Configurable**: Easy configuration for multiple API keys

## 📦 Installation

### npm

```bash
npm install -g opendragon

# Run
dragon
```

### Build from source

```bash
git clone https://github.com/zhaojiewen/open-dragon.git
cd open-dragon
npm install
npm run build
npm link
```

## 🚀 Quick Start

```bash
# 1. Initialize config (with optional encryption)
dragon init
dragon init --encrypt          # Encrypt API keys with a password

# 2. Edit config to add your API keys
dragon config edit
# Or manually: vim ~/.dragon/config.json

# 3. Start interactive chat
dragon

# Or specify a provider and model
dragon chat --provider openai --model gpt-4o
```

## ⚙️ Configuration

Config file: `~/.dragon/config.json`

```json
{
  "defaultProvider": "anthropic",
  "providers": {
    "openai": {
      "apiKey": "YOUR_OPENAI_API_KEY",
      "models": ["gpt-4o", "gpt-4-turbo"],
      "defaultModel": "gpt-4o"
    },
    "anthropic": {
      "apiKey": "YOUR_ANTHROPIC_API_KEY",
      "models": ["claude-opus-4-7", "claude-sonnet-4-6", "claude-haiku-4-5"],
      "defaultModel": "claude-opus-4-7"
    },
    "gemini": {
      "apiKey": "YOUR_GEMINI_API_KEY",
      "models": ["gemini-1.5-pro", "gemini-1.5-flash"],
      "defaultModel": "gemini-1.5-pro"
    },
    "deepseek": {
      "apiKey": "YOUR_DEEPSEEK_API_KEY",
      "models": ["deepseek-chat", "deepseek-reasoner"],
      "defaultModel": "deepseek-chat"
    },
    "qwen": {
      "apiKey": "YOUR_QWEN_API_KEY",
      "baseUrl": "https://dashscope.aliyuncs.com/compatible-mode/v1",
      "models": ["qwen-max", "qwen-plus", "qwen-turbo"],
      "defaultModel": "qwen-max"
    }
  },
  "tools": {
    "enabled": ["bash", "read", "write", "edit", "glob", "grep", "webfetch", "websearch", "agent"]
  },
  "workspace": {
    "paths": [],
    "writeEnabled": true,
    "enforceBounds": false,
    "allowHomeDir": true
  },
  "logging": {
    "level": "info",
    "logFile": "/path/to/dragon.log",
    "enableConsole": true
  }
}
```

### Workspace Configuration

Restrict file operations to specific directories:

```json
{
  "workspace": {
    "paths": ["/home/user/projects"],
    "writeEnabled": true,
    "enforceBounds": true,
    "allowHomeDir": true
  }
}
```

## 📝 CLI Commands

| Command | Description |
|---------|-------------|
| `dragon` | Start REPL (default) |
| `dragon init` | Initialize config file |
| `dragon init --encrypt` | Initialize with encrypted API keys |
| `dragon config` | Show config file location |
| `dragon config edit` | Open config in editor |
| `dragon config show` | Print config contents |
| `dragon config validate` | Validate configuration |
| `dragon chat` | Start interactive chat |
| `dragon chat -p <provider> -m <model>` | Chat with specific provider/model |
| `dragon --monitor` | Start with performance monitoring |
| `dragon --help` | Show help |
| `dragon --version` | Show version |

## 💻 REPL Commands

| Command | Description |
|---------|-------------|
| `/help` | Show available commands |
| `/clear` | Clear conversation history |
| `/history` | Show conversation history |
| `/history save <name>` | Save history to file |
| `/history load <name>` | Load history from file |
| `/provider [name]` | Show or switch provider |
| `/model [name]` | Show or switch model |
| `/tools` | List available tools |
| `/auto [out]` | Toggle auto-approve dangerous tools |
| `/ask` | Require confirmation for all tools |
| `/workspace <path>` | Set workspace directory |
| `/save-tokens` | Save token usage data |
| `/cost` | Show token usage & cost estimate |
| `/perf` | Show performance report (needs `--monitor`) |
| `/debug [on|off]` | Toggle debug mode |
| `/exit`, `/quit` | Exit REPL |

## 🔧 Available Tools

| Tool | Description |
|------|-------------|
| `bash` | Execute shell commands |
| `read` | Read file contents |
| `write` | Write to files |
| `edit` | Edit files with string replacement |
| `glob` | Find files by pattern |
| `grep` | Search file contents |
| `webfetch` | Fetch web page content |
| `websearch` | Web search (requires API config) |
| `agent` | Spawn sub-agent for complex tasks |

## 🌐 Supported Providers

| Provider | Models |
|----------|--------|
| Anthropic | claude-opus-4-7, claude-sonnet-4-6, claude-haiku-4-5 |
| OpenAI | gpt-4o, gpt-4-turbo, gpt-3.5-turbo |
| Google Gemini | gemini-1.5-pro, gemini-1.5-flash |
| DeepSeek | deepseek-chat, deepseek-reasoner |
| Qwen (通义千问) | qwen-max, qwen-plus, qwen-turbo, qwen-long |
| Moonshot (月之暗面) | moonshot-v1-8k, moonshot-v1-32k, moonshot-v1-128k |
| Yi (零一万物) | yi-lightning, yi-large, yi-medium |
| Doubao (豆包) | doubao-pro-4k, doubao-pro-32k, doubao-pro-128k |

## ➕ Custom Providers

Any OpenAI-compatible API can be added:

```json
{
  "providers": {
    "my-custom-llm": {
      "apiKey": "YOUR_API_KEY",
      "baseUrl": "https://api.example.com/v1",
      "models": ["model-1", "model-2"],
      "defaultModel": "model-1"
    }
  }
}
```

## 🔐 Security

### API Key Encryption

AES-256-GCM encryption for sensitive config fields (`apiKey`, `token`, `secret`, `password`):

```bash
# Initialize with encryption
dragon init --encrypt

# Run with encrypted config
DRAGON_PASSWORD=yourpassword dragon

# Or use the --password flag (visible in shell history - less secure)
dragon init --encrypt --password yourpassword
```

Security features:
- **AES-256-GCM** with random IV per encryption
- **PBKDF2** key derivation (100,000 iterations, SHA-512)
- Automatic detection of sensitive fields
- Secure file permissions (`0o600`)
- Timing-safe comparison for key verification

## 📊 Performance Monitoring

```bash
# Enable via flag
dragon --monitor

# Or via environment variable
DRAGON_PERF_MONITOR=true dragon

# View report in REPL
> /perf
```

Tracked metrics: API call times, tool execution stats, config load time, streaming performance.

## 🐛 Debug Mode

```bash
# Environment variable
DRAGON_DEBUG=true dragon

# REPL command
> /debug on
> /debug off

# Log levels via env
DRAGON_LOG_LEVEL=0  # DEBUG
DRAGON_LOG_LEVEL=1  # INFO (default)
DRAGON_LOG_LEVEL=2  # WARN
DRAGON_LOG_LEVEL=3  # ERROR
DRAGON_LOG_LEVEL=4  # SILENT
```

## 📋 Development

```bash
npm install          # Install dependencies
npm run build        # Compile TypeScript
npm run dev          # Run directly with tsx
npm run bundle       # Create single-file dist
npm run lint         # Run ESLint
```

## 🧪 Testing

```bash
npm test              # Run all tests
npm run test:watch    # Watch mode
npm run test:coverage # With coverage report (text + coverage/index.html)
npx vitest tests/unit/path/to/test.test.ts  # Run single test file
```

Test structure:

```
tests/
├── unit/
│   ├── tools/        # Tool tests (bash, read, write, edit, glob, grep, registry)
│   ├── config/       # Config tests
│   ├── encryption/   # Encryption tests
│   ├── providers/    # Provider tests
│   └── utils/        # Error, logger, performance tests
```

## 🔄 CI/CD

GitHub Actions workflows (`.github/workflows/`):

- **CI**: Runs on push to main, tests on Node.js 18.x/20.x/22.x, generates coverage reports
- **Release**: Triggers on GitHub release, publishes to npm, uploads bundle

Required secrets: `NPM_TOKEN`, `CODECOV_TOKEN` (optional)

## 📄 License

[MIT](LICENSE)

## 🤝 Contributing

Issues and pull requests welcome!

## 📮 Links

- [GitHub Repository](https://github.com/zhaojiewen/open-dragon)
- [npm Package](https://www.npmjs.com/package/opendragon)
- [Report Bug](https://github.com/zhaojiewen/open-dragon/issues)
