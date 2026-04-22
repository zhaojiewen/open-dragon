# 🐉 Dragon - Multi-Provider AI CLI

[![npm version](https://badge.fury.io/js/opendragon.svg)](https://www.npmjs.com/package/opendragon)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/node/v/opendragon.svg)](https://nodejs.org/)

A powerful command-line tool that supports multiple AI providers, inspired by Claude Code.

**完全复制Claude Code CLI功能，但能配置其他AI智能体账号**

## ✨ Features

- 🔄 **Multi-Provider Support**: OpenAI, Anthropic Claude, Google Gemini, DeepSeek, and Chinese LLMs
- 💬 **REPL Interface**: Interactive chat with streaming responses
- 🛠️ **Tool System**: Execute commands, read/write files, search code, and more
- 🤖 **Agent Support**: Spawn sub-agents for complex tasks
- ⚙️ **Configurable**: Easy configuration for multiple API keys
- 📦 **Zero Dependencies**: Single file distribution available

## 📦 Installation

### npm（推荐）

```bash
npm install -g opendragon

# 运行
dragon
```

### 从GitHub Release下载

1. 访问 [Releases](https://github.com/zhaojiewen/open-dragon/releases) 页面
2. 下载最新版本的 `dragon.js`
3. 运行：

```bash
chmod +x dragon.js
./dragon.js
```

### 从源码构建

```bash
git clone https://github.com/zhaojiewen/open-dragon.git
cd open-dragon
npm install
npm run build
npm link
```

## 🚀 Quick Start

```bash
# 1. 初始化配置
dragon init

# 2. 编辑配置文件添加API密钥
# 配置文件位置: ~/.dragon/config.json
vim ~/.dragon/config.json

# 3. 启动交互式聊天
dragon

# 或指定提供商
dragon chat --provider openai --model gpt-4o
```

## ⚙️ Configuration

配置文件位于 `~/.dragon/config.json`：

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
    "enabled": ["bash", "read", "write", "edit", "glob", "grep", "webfetch", "agent"]
  }
}
```

## 📝 CLI Commands

| Command | Description |
|---------|-------------|
| `dragon` | 启动REPL（默认） |
| `dragon init` | 初始化配置文件 |
| `dragon config` | 显示配置文件位置 |
| `dragon chat` | 启动交互式聊天 |
| `dragon --help` | 显示帮助 |
| `dragon --version` | 显示版本 |

## 💻 REPL Commands

进入REPL后可用的命令：

| Command | Description |
|---------|-------------|
| `/help` | 显示可用命令 |
| `/clear` | 清空对话历史 |
| `/history` | 显示对话历史 |
| `/provider` | 显示当前提供商 |
| `/model` | 显示或切换模型 |
| `/tools` | 列出可用工具 |
| `/exit` | 退出REPL |

## 🔧 Available Tools

| Tool | Description |
|------|-------------|
| `bash` | 执行Shell命令 |
| `read` | 读取文件内容 |
| `write` | 写入文件 |
| `edit` | 编辑文件（字符串替换） |
| `glob` | 按模式查找文件 |
| `grep` | 搜索文件内容 |
| `webfetch` | 抓取网页内容 |
| `websearch` | 网络搜索（需配置API） |
| `agent` | 启动子代理执行任务 |

## 🌐 Supported Providers

| Provider | Models |
|----------|--------|
| OpenAI | gpt-4o, gpt-4-turbo, gpt-3.5-turbo |
| Anthropic | claude-sonnet-4-6, claude-opus-4-7, claude-haiku-4-5 |
| Google Gemini | gemini-1.5-pro, gemini-1.5-flash |
| DeepSeek | deepseek-chat, deepseek-reasoner |
| 通义千问 (Qwen) | qwen-max, qwen-plus, qwen-turbo |
| 月之暗面 (Moonshot) | moonshot-v1-8k, moonshot-v1-32k, moonshot-v1-128k |
| 零一万物 (Yi) | yi-lightning, yi-large, yi-medium |
| 豆包 (Doubao) | doubao-pro-4k, doubao-pro-32k, doubao-pro-128k |

## ➕ Adding Custom Providers

支持任何OpenAI兼容的API：

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

## 📋 Development

```bash
# 安装依赖
npm install

# 构建
npm run build

# 开发模式
npm run dev

# 打包成单文件
npm run bundle
```

## 🔄 Release Process

```bash
# 更新版本
npm version patch  # 或 minor / major

# 发布到npm
npm publish

# 创建Git标签并推送
git tag v1.0.0
git push origin --tags
```

然后在GitHub上创建Release，上传打包后的文件。

## 📄 License

[MIT](LICENSE)

## 🤝 Contributing

欢迎提交Issue和Pull Request！

## 📮 Links

- [GitHub Repository](https://github.com/zhaojiewen/open-dragon)
- [npm Package](https://www.npmjs.com/package/opendragon)
- [Report Bug](https://github.com/zhaojiewen/open-dragon/issues)
