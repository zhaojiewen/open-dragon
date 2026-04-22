# Changelog

All notable changes to the Dragon project will be documented in this file.

## [1.1.0] - 2025-04-22

### Added

#### 🧪 Testing Framework
- **Vitest** integration for unit testing
- Comprehensive test suite with >80% coverage target
- Tests for error handling, logging, performance monitoring, encryption, and tools
- Coverage reports with v8 provider
- Watch mode and UI for test development

#### 🔄 CI/CD Pipeline
- **GitHub Actions** workflow for automated testing
- Multi-version Node.js testing (18.x, 20.x, 22.x)
- Automated npm publishing on release
- Code coverage upload to Codecov
- Lint checks and build verification

#### 🎯 Custom Error Types
- Structured error handling system with specific error types:
  - `DragonError`: Base error class
  - `ConfigError`: Configuration-related errors
  - `ProviderError`: AI provider errors
  - `ToolError`: Tool execution errors
  - `APIKeyError`: API key validation errors
  - `NetworkError`: Network-related errors
  - `FileError`: File operation errors
  - `ValidationError`: Input validation errors
  - `AuthenticationError`: Authentication failures (401)
  - `RateLimitError`: Rate limit exceeded (429)
- Error wrapping utilities
- Detailed error messages with context

#### 📝 Logging System
- Multi-level logging (DEBUG, INFO, WARN, ERROR, SILENT)
- Timestamp support
- Colored output
- Environment variable control (`DRAGON_LOG_LEVEL`, `DRAGON_DEBUG`)
- REPL command to toggle debug mode (`/debug on|off`)

#### ⏱️ Performance Monitoring
- Execution time tracking for:
  - API calls
  - Tool executions
  - Configuration loading
  - Stream processing
- Performance metrics collection
- Summary reports with min/max/average duration
- Enable via `DRAGON_PERF_MONITOR=true` or `/perf` command
- Decorator for measuring method performance

#### 🔐 Configuration Encryption
- **AES-256-GCM** encryption for sensitive config fields
- Automatic detection of sensitive fields (apiKey, token, password, secret)
- PBKDF2 key derivation with password
- Secure key storage with proper file permissions
- CLI option `--encrypt` for initialization
- Transparent encryption/decryption on config load/save

### Changed

#### Improved Provider Implementation
- Enhanced error handling in Anthropic provider
- API key validation on provider initialization
- Detailed error messages for authentication and rate limit errors
- Performance measurement integration

#### Enhanced REPL
- New commands: `/perf`, `/debug`, `/encrypt`
- Performance monitoring integration
- Better error messages with structured error types
- Debug logging throughout the conversation flow

#### Better Configuration Management
- Encryption support on load/save
- Improved error messages
- Debug logging during config operations

### Developer Experience

#### New Scripts
- `npm test` - Run test suite
- `npm run test:watch` - Watch mode for tests
- `npm run test:coverage` - Generate coverage report
- `npm run test:ui` - Visual test interface

#### Documentation
- Comprehensive test documentation
- Security features guide
- Performance monitoring guide
- Debug mode instructions
- CI/CD pipeline documentation

### Technical Details

#### Dependencies Added
- `vitest` - Testing framework
- `@vitest/coverage-v8` - Coverage provider
- `@vitest/ui` - Test UI

#### File Structure
```
src/
├── errors/          # Custom error types
│   └── index.ts
├── logger/          # Logging system
│   └── index.ts
├── performance/     # Performance monitoring
│   └── index.ts
└── encryption/      # Configuration encryption
    └── index.ts

test/                # Test files
├── errors.test.ts
├── logger.test.ts
├── performance.test.ts
├── encryption.test.ts
└── tools.test.ts

.github/
└── workflows/
    └── ci.yml      # CI/CD pipeline
```

## [1.0.0] - 2025-04-20

### Initial Release
- Multi-provider AI CLI tool
- Support for OpenAI, Anthropic, Gemini, DeepSeek, and Chinese LLMs
- REPL interface with streaming responses
- Tool system with 9 built-in tools
- Configuration management
- Interactive chat interface
