# 🐉 Dragon - Multi-Provider AI CLI

[![npm version](https://badge.fury.io/js/opendragon.svg)](https://www.npmjs.com/package/opendragon)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/node/v/opendragon.svg)](https://nodejs.org/)

A powerful command-line tool that supports multiple AI providers, inspired by Claude Code.

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

# 运行测试
npm test

# 测试覆盖率
npm run test:coverage

# 监听模式测试
npm run test:watch
```

## 🧪 测试

项目包含完整的单元测试套件，使用 Vitest 框架：

```bash
# 运行所有测试
npm test

# 生成覆盖率报告
npm run test:coverage

# 监听模式（开发时推荐）
npm run test:watch

# 可视化测试界面
npm run test:ui
```

测试覆盖详情请参阅 `test/` 目录。

## 🔐 安全特性

### API 密钥加密

支持对配置文件中的敏感字段进行加密存储：

```bash
# 初始化配置并启用加密（交互式输入密码）
dragon init --encrypt

# 使用命令行密码
dragon init --encrypt --password your-secure-password
```

安全特性：
- ✅ **AES-256-GCM** 加密算法
- ✅ 自动识别敏感字段（`apiKey`, `token`, `password`, `secret`等）
- ✅ **PBKDF2** 密钥派生（100,000 次迭代）
- ✅ 安全的文件权限（`0o600`）
- ✅ 随机盐值和 IV

使用示例：
```bash
# 加密配置
dragon init --encrypt --password mypassword

# 运行时自动解密（会提示输入密码）
dragon

# 或设置环境变量（不推荐在生产环境使用）
DRAGON_ENCRYPTION_PASSWORD=mypassword dragon
```

## 📊 性能监控

启用性能监控以分析操作执行时间：

```bash
# 环境变量启用
DRAGON_PERF_MONITOR=true dragon

# 或在 REPL 中查看报告
> /perf
```

监控指标：
- ⏱️ API 调用时间
- 🔧 工具执行统计
- 📄 配置加载时间
- 📡 流式响应性能

性能报告示例：
```
📊 Performance Report:
================================================================================
┌─────────┬───────────┬────────────┬─────────┬─────────┬─────────┐
│ (index) │ Operation │ Total Calls│ Total   │ Avg     │ Max     │
├─────────┼───────────┼────────────┼─────────┼─────────┼─────────┤
│    0    │ 'anthropic:chat' │  5  │ '152.34'│ '30.47' │ '45.23' │
│    1    │ 'tool:bash'      │ 10  │ '85.12' │ '8.51'  │ '12.34' │
└─────────┴───────────┴────────────┴─────────┴─────────┴─────────┘
```

## 🐛 调试模式

启用详细日志输出以便调试：

```bash
# 方式 1: 环境变量
DRAGON_DEBUG=true dragon

# 方式 2: REPL 命令
> /debug on

# 关闭调试
> /debug off

# 查看当前状态
> /debug
```

日志级别说明：
- **DEBUG**: 详细的调试信息（API 请求、内部状态）
- **INFO**: 常规信息（操作成功消息）
- **WARN**: 警告信息（非关键错误）
- **ERROR**: 错误信息（操作失败）
- **SILENT**: 不输出任何日志

环境变量控制：
```bash
DRAGON_LOG_LEVEL=0  # DEBUG
DRAGON_LOG_LEVEL=1  # INFO（默认）
DRAGON_LOG_LEVEL=2  # WARN
DRAGON_LOG_LEVEL=3  # ERROR
DRAGON_LOG_LEVEL=4  # SILENT
```

```typescript
import { DragonError, ErrorCode, wrapError } from './utils/errors';

// 使用自定义错误
throw new ConfigNotFoundError('/path/to/config');
throw new ApiKeyMissingError('openai');

// 错误包装
const wrapped = wrapError(error, 'Operation failed');
console.log(wrapped.code, wrapped.details);
```

#### 📊 日志系统
多级别日志，支持文件输出和彩色格式：

```bash
# 启用调试模式
DEBUG=true dragon
```

```typescript
import { getLogger } from './utils/logger';

const logger = getLogger();
logger.debug('Debug info', { data: 'value' });
logger.info('Info message');
logger.warn('Warning');
logger.error('Error details');
```

#### ⚡ 性能监控
内置性能指标收集和分析：

```typescript
import { getPerformanceMonitor } from './utils/performance';

const monitor = getPerformanceMonitor();
await monitor.timeAsync('operation', async () => { /* ... */ });
monitor.logSummary(); // 打印性能统计
```

#### 🚀 CI/CD 集成
- **GitHub Actions** 自动化测试和发布
- 多 Node.js 版本测试 (18, 20, 22)
- 自动 npm 发布
- 代码覆盖率报告
- 安全审计

详细文档请查看 [DEVELOPMENT.md](./DEVELOPMENT.md)

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

## 🧪 Testing

This project uses [Vitest](https://vitest.dev/) for testing.

### Running Tests

```bash
# Run all tests
npm test

# Run tests with coverage report
npm run test:coverage

# Run tests with UI
npm run test:ui

# Run tests in watch mode
npm test -- --watch
```

### Test Structure

```
tests/
├── unit/tools/          # Tool tests
│   ├── bash.test.ts
│   ├── read.test.ts
│   ├── write.test.ts
│   ├── edit.test.ts
│   ├── glob.test.ts
│   └── registry.test.ts
├── encryption.test.ts   # Encryption service tests
├── errors.test.ts       # Error handling tests
├── logger.test.ts       # Logging system tests
├── performance.test.ts  # Performance monitoring tests
└── tools.test.ts        # Integration tests
```

### Coverage Reports

After running `npm run test:coverage`, view the HTML report:
```bash
open coverage/index.html
```

## 🔄 CI/CD

This project uses GitHub Actions for continuous integration and deployment.

### Workflows

- **CI Workflow** (`.github/workflows/ci.yml`):
  - Runs on push to main/master branches
  - Tests on Node.js 18.x, 20.x, 22.x
  - Generates coverage reports
  - Uploads to Codecov

- **Release Workflow** (`.github/workflows/release.yml`):
  - Triggers on GitHub release creation
  - Publishes to npm automatically
  - Uploads bundle to release

### Required Secrets

Configure these in your GitHub repository settings:

- `NPM_TOKEN`: npm registry access token for publishing
- `CODECOV_TOKEN`: Codecov upload token (optional)
