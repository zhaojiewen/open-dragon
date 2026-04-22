# Dragon - Multi-Provider AI CLI

A powerful command-line tool that supports multiple AI providers, inspired by Claude Code.

## Features

- **Multi-Provider Support**: OpenAI, Anthropic Claude, Google Gemini, DeepSeek, and Chinese LLMs (Qwen, Moonshot, Yi, Doubao)
- **REPL Interface**: Interactive chat with streaming responses
- **Tool System**: Execute commands, read/write files, search code, and more
- **Agent Support**: Spawn sub-agents for complex tasks
- **Configurable**: Easy configuration for multiple API keys

## Installation

### 方式一：npm安装（推荐）

```bash
# 从npm安装
npm install -g opendragon

# 运行
dragon
```

### 方式二：从源码安装

```bash
# Clone and build
git clone <repo-url>
cd OpenDragon
npm install
npm run build
npm link
```

### 方式三：单文件打包

```bash
# 安装依赖
npm install

# 打包成单文件
npm run bundle

# 生成的文件在 dist/dragon.js，可以直接运行
node dist/dragon.js

# 或复制到任何位置
cp dist/dragon.js /usr/local/bin/dragon
chmod +x /usr/local/bin/dragon
```

### 方式四：Homebrew（macOS）

创建 Homebrew Formula：

```ruby
class Opendragon < Formula
  desc "Multi-provider AI CLI tool"
  homepage "https://github.com/yourname/opendragon"
  url "https://registry.npmjs.org/opendragon/-/opendragon-1.0.0.tgz"
  sha256 "..."
  license "MIT"

  depends_on "node"

  def install
    system "npm", "install", *std_npm_args
    bin.install_symlink libexec/"bin/dragon"
  end
end
```

## Quick Start

```bash
# Initialize configuration
dragon init

# Edit config file to add your API keys
# Config location: ~/.dragon/config.json

# Start interactive chat
dragon

# Or specify a provider
dragon chat --provider openai
```

## Configuration

Configuration file is located at `~/.dragon/config.json`:

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
      "models": ["claude-sonnet-4-6", "claude-opus-4-7"],
      "defaultModel": "claude-sonnet-4-6"
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
      "models": ["qwen-max", "qwen-plus"],
      "defaultModel": "qwen-max"
    }
  },
  "tools": {
    "enabled": ["bash", "read", "write", "edit", "glob", "grep", "webfetch", "agent"],
    "bash": {
      "dangerouslyDisableSandbox": false
    }
  }
}
```

## CLI Commands

```bash
dragon              # Start REPL (default)
dragon init         # Initialize config file
dragon config       # Show config location
dragon chat         # Start interactive chat
dragon --help       # Show help
dragon --version    # Show version
```

## REPL Commands

Once in the REPL, you can use these commands:

- `/help` - Show available commands
- `/clear` - Clear conversation history
- `/history` - Show conversation history
- `/provider` - Show current provider
- `/model` - Show or change model
- `/tools` - List available tools
- `/exit` - Exit the REPL

## Available Tools

| Tool | Description |
|------|-------------|
| `bash` | Execute shell commands |
| `read` | Read file contents |
| `write` | Write to files |
| `edit` | Edit files with string replacement |
| `glob` | Find files by pattern |
| `grep` | Search content in files |
| `webfetch` | Fetch web page content |
| `websearch` | Search the web (requires API config) |
| `agent` | Spawn sub-agent for tasks |

## Adding New Providers

You can add any OpenAI-compatible API as a provider:

```json
{
  "providers": {
    "custom-llm": {
      "apiKey": "YOUR_API_KEY",
      "baseUrl": "https://api.example.com/v1",
      "models": ["model-1", "model-2"],
      "defaultModel": "model-1"
    }
  }
}
```

## Supported Providers

| Provider | Default Models |
|----------|----------------|
| OpenAI | gpt-4o, gpt-4-turbo, gpt-3.5-turbo |
| Anthropic | claude-sonnet-4-6, claude-opus-4-7, claude-haiku-4-5 |
| Google Gemini | gemini-1.5-pro, gemini-1.5-flash |
| DeepSeek | deepseek-chat, deepseek-reasoner |
| Qwen (通义千问) | qwen-max, qwen-plus, qwen-turbo |
| Moonshot (月之暗面) | moonshot-v1-8k, moonshot-v1-32k, moonshot-v1-128k |
| Yi (零一万物) | yi-lightning, yi-large, yi-medium |
| Doubao (豆包) | doubao-pro-4k, doubao-pro-32k, doubao-pro-128k |

## 发布新版本

```bash
# 更新版本号
npm version patch  # 或 minor / major

# 发布到npm
npm publish

# 或使用GitHub Release
# 在GitHub上创建新Release，上传打包后的文件
```

## License

MIT
