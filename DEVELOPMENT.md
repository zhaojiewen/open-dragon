# OpenDragon - Development & Testing Guide

## 🧪 Testing

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run tests with UI
npm run test:ui
```

### Test Structure

```
tests/
├── unit/              # Unit tests
│   ├── tools/         # Tool tests
│   ├── config/        # Config tests
│   └── errors/        # Error handling tests
├── integration/       # Integration tests
└── *.test.ts         # Other test files
```

### Test Coverage

We aim for high test coverage across all modules:
- **Providers**: AI provider implementations
- **Tools**: Tool execution and validation
- **Config**: Configuration loading and validation
- **Utils**: Logger, performance monitoring, error handling

---

## 🔧 Development Features

### 1. Custom Error Types

All errors in OpenDragon use custom error types for better error handling:

```typescript
import {
  DragonError,
  ConfigNotFoundError,
  ApiKeyMissingError,
  ProviderNotFoundError,
  ToolNotFoundError,
  ErrorCode,
  isDragonError,
  wrapError,
} from './utils/errors';

// Using custom errors
throw new ConfigNotFoundError('/path/to/config.json');
throw new ApiKeyMissingError('openai');

// Error handling
try {
  // ... operation
} catch (error) {
  const wrapped = wrapError(error, 'Failed to execute operation');
  console.error(wrapped.toString());
}

// Check error type
if (isDragonError(error)) {
  console.log(error.code);  // ErrorCode enum
  console.log(error.details); // Additional details
}
```

**Error Categories:**
- **Config Errors** (1xxx): Configuration loading and validation
- **Provider Errors** (2xxx): AI provider initialization and API calls
- **Tool Errors** (3xxx): Tool execution and validation
- **File System Errors** (4xxx): File operations
- **Network Errors** (5xxx): Web fetch and search
- **General Errors** (9xxx): Misc errors

---

### 2. Logging System

Advanced logging with multiple levels and output options:

```typescript
import { getLogger, createLogger, LogLevel } from './utils/logger';

// Get global logger
const logger = getLogger();

// Or create custom logger
const customLogger = createLogger({
  level: LogLevel.DEBUG,
  enableConsole: true,
  enableFile: true,
  logFile: '/path/to/dragon.log',
  timestamp: true,
  colors: true,
});

// Log messages
logger.debug('Debug message', { data: 'value' });
logger.info('Info message');
logger.warn('Warning message');
logger.error('Error message');

// Enable debug mode
logger.enableDebug();
process.env.DEBUG = 'true'; // Or via environment variable
```

**Log Levels:**
- `DEBUG` (0): Detailed debugging information
- `INFO` (1): General information
- `WARN` (2): Warning messages
- `ERROR` (3): Error messages
- `NONE` (9999): Disable all logging

---

### 3. Performance Monitoring

Built-in performance monitoring for API calls, tool execution, and operations:

```typescript
import { getPerformanceMonitor } from './utils/performance';

const monitor = getPerformanceMonitor();

// Time an operation
monitor.startTimer('operation-name');
// ... do work ...
const duration = monitor.endTimer('operation-name');

// Time async operations
await monitor.timeAsync('api-call', async () => {
  return await provider.stream(messages);
});

// Record metrics
monitor.recordToolExecution('bash', 123.45, true);
monitor.recordApiCall('anthropic', 456.78, false);

// Get summary
const summary = monitor.getSummary();
console.log(summary);

// Log summary
monitor.logSummary();
```

**Metrics Tracked:**
- Tool execution times and success rates
- API call durations and error rates
- Total requests and errors
- System uptime

---

## 🚀 CI/CD Pipeline

### GitHub Actions Workflows

We use GitHub Actions for automated testing and deployment:

#### 1. **CI Workflow** (`.github/workflows/ci.yml`)
Runs on every push and pull request:
- ✅ Tests on Node.js 18.x, 20.x, 22.x
- ✅ Linting and type checking
- ✅ Test coverage reports
- ✅ Security audit

#### 2. **Release Workflow** (`.github/workflows/release.yml`)
Automated npm publishing:
- Triggers on GitHub release creation
- Publishes to npm automatically
- Uploads build artifacts

#### 3. **Dependabot** (`.github/workflows/dependabot.yml`)
Auto-merge for dependency updates:
- Patch and minor updates auto-approved
- Major updates require manual review

### Setting Up CI/CD

1. **Enable GitHub Actions** in repository settings
2. **Add NPM Token**:
   ```bash
   # Generate token at npmjs.com
   # Add to GitHub repo secrets as NPM_TOKEN
   ```
3. **Add Codecov Token** (optional):
   ```bash
   # Get token from codecov.io
   # Add to GitHub repo secrets as CODECOV_TOKEN
   ```
4. **Add Snyk Token** (optional):
   ```bash
   # Get token from snyk.io
   # Add to GitHub repo secrets as SNYK_TOKEN
   ```

### Manual Release Process

```bash
# Update version
npm version patch  # or minor / major

# Run tests
npm test

# Build
npm run build

# Publish to npm
npm publish

# Create git tag
git push origin --tags
```

---

## 📊 Monitoring & Debugging

### Enable Debug Mode

```bash
# Via environment variable
export DEBUG=true
dragon

# Or in code
import { getLogger } from './utils/logger';
getLogger().enableDebug();
```

### Performance Analysis

```typescript
import { getPerformanceMonitor } from './utils/performance';

const monitor = getPerformanceMonitor();

// After operations...
monitor.logSummary();
// Output:
// {
//   totalRequests: 25,
//   totalErrors: 2,
//   uptime: 123.45,
//   successRate: '92.00',
//   toolStats: {
//     bash: { count: 10, avg: 45.2, min: 12, max: 120 },
//     read: { count: 8, avg: 5.3, min: 2, max: 15 }
//   },
//   apiStats: {
//     anthropic: { count: 7, avg: 234.5, min: 120, max: 450 }
//   }
// }
```

### Error Tracking

All errors include:
- Error code (ErrorCode enum)
- Detailed message
- Stack trace
- Additional context in `details` field

```typescript
try {
  // ... operation
} catch (error) {
  if (isDragonError(error)) {
    console.log('Error Code:', error.code);
    console.log('Message:', error.message);
    console.log('Details:', error.details);
  }
}
```

---

## 🛠️ Development Scripts

```bash
# Development
npm run dev           # Run with ts-node
npm run build         # Compile TypeScript
npm run bundle        # Create single-file bundle

# Testing
npm test              # Run tests
npm run test:coverage # Run with coverage
npm run test:ui       # Run with UI

# Code Quality
npm run lint          # Run ESLint
npx tsc --noEmit      # Type check without emit

# Release
npm version patch     # Bump version
npm publish           # Publish to npm
```

---

## 📈 Code Quality Standards

### Test Coverage Goals
- **Statements**: > 80%
- **Branches**: > 75%
- **Functions**: > 80%
- **Lines**: > 80%

### TypeScript Configuration
- Strict mode enabled
- No implicit any
- Strict null checks
- No unused locals/parameters

### Best Practices
1. ✅ Write tests for all new features
2. ✅ Use custom error types
3. ✅ Log important operations
4. ✅ Monitor performance
5. ✅ Handle errors gracefully
6. ✅ Document complex logic

---

## 🔍 Troubleshooting

### Test Failures

```bash
# Run specific test file
npx vitest run tests/errors.test.ts

# Run tests matching pattern
npx vitest run -t "should create error"

# Update snapshots
npx vitest -u
```

### Build Errors

```bash
# Clean build
rm -rf dist/
npm run build

# Check types
npx tsc --noEmit
```

### CI/CD Issues

1. Check GitHub Actions logs
2. Verify all secrets are set
3. Ensure tests pass locally
4. Check Node.js version compatibility

---

## 📝 Contributing

When contributing, please:
1. Write tests for new features
2. Update documentation
3. Follow existing code style
4. Run all tests before submitting PR
5. Ensure CI passes

See [CLAUDE.md](./CLAUDE.md) for architecture details.
