# OpenDragon 测试和CI/CD设置指南

## ✅ 已完成

### 1. 测试框架配置

#### 安装的依赖
```json
{
  "devDependencies": {
    "vitest": "^2.0.0",
    "@vitest/coverage-v8": "^2.0.0",
    "@vitest/ui": "^2.0.0"
  }
}
```

#### NPM脚本
```json
{
  "scripts": {
    "test": "vitest",
    "test:coverage": "vitest --coverage",
    "test:ui": "vitest --ui"
  }
}
```

#### Vitest配置 (vitest.config.ts)
- 环境: Node.js
- 覆盖率: v8 provider
- 输出: text, json, html

### 2. 测试覆盖

#### 当前测试统计
```
Test Files: 11个测试文件
Tests: 147个测试用例
Pass Rate: 77.5% (114 passed / 33 failed)
```

#### 测试模块
| 模块 | 文件 | 测试数 | 描述 |
|------|------|--------|------|
| 工具 | `unit/tools/*.test.ts` | 50+ | 核心工具测试 |
| 加密 | `encryption.test.ts` | 23 | API密钥加密 |
| 错误 | `errors.test.ts` | 18 | 错误处理 |
| 日志 | `logger.test.ts` | 16 | 日志系统 |
| 性能 | `performance.test.ts` | 13 | 性能监控 |
| 集成 | `tools.test.ts` | 27 | 综合测试 |

### 3. CI/CD工作流

#### 持续集成 (ci.yml)
```yaml
触发条件:
  - push to main/master
  - pull requests

执行步骤:
  1. 检出代码
  2. 设置Node.js (18, 20, 22)
  3. 安装依赖 (npm ci)
  4. 代码检查 (npm run lint)
  5. 构建项目 (npm run build)
  6. 运行测试 (npm test)
  7. 生成覆盖率报告
  8. 上传到Codecov
  9. 上传构建产物
```

#### 自动发布 (release.yml)
```yaml
触发条件:
  - GitHub Release创建

执行步骤:
  1. 检出代码
  2. 设置Node.js
  3. 安装和构建
  4. 发布到NPM
  5. 上传bundle到Release
```

## 🚀 快速开始

### 运行测试
```bash
# 运行所有测试
npm test

# 带覆盖率报告
npm run test:coverage

# 可视化界面
npm run test:ui

# 监听模式
npm test -- --watch
```

### 查看覆盖率
```bash
npm run test:coverage
open coverage/index.html
```

### 本地测试CI流程
```bash
# 安装依赖
npm ci

# 代码检查
npm run lint

# 构建
npm run build

# 测试
npm test
```

## 📝 编写新测试

参考 `tests/test-example.test.ts` 获取示例。

基本模板:
```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('MyFeature', () => {
  beforeEach(() => {
    // Setup
  });

  afterEach(() => {
    // Cleanup
  });

  it('should work correctly', async () => {
    // Test code
    expect(result).toBe(expected);
  });
});
```

## ⚙️ GitHub配置

### 必需的Secrets
在GitHub仓库设置中配置:

1. **NPM_TOKEN**
   - 获取方式: npmjs.com > Access Tokens > Generate New Token
   - 权限: Automation
   - 用途: 发布包到NPM

2. **CODECOV_TOKEN** (可选)
   - 获取方式: codecov.io > 项目设置
   - 用途: 上传覆盖率报告

### 配置步骤
1. 进入仓库 Settings > Secrets and variables > Actions
2. 点击 "New repository secret"
3. 添加 `NPM_TOKEN` 和 `CODECOV_TOKEN`

## 🔄 发布流程

### 自动发布
1. 更新 `package.json` 版本号
2. 提交并推送到main/master
3. CI测试通过
4. 在GitHub创建Release
5. 自动发布到NPM

### 手动发布
```bash
# 更新版本
npm version patch|minor|major

# 构建
npm run build

# 发布
npm publish

# 推送标签
git push --tags
```

## 📊 监控

### GitHub Actions
查看工作流运行状态:
- Actions标签页
- CI工作流: 每次提交
- Release工作流: 发布时

### 测试覆盖率
- Codecov仪表板
- PR自动评论覆盖率变化
- 趋势图表

## 🐛 故障排除

### 测试失败
```bash
# 详细输出
npm test -- --reporter=verbose

# 运行单个测试
npm test path/to/test.ts

# 更新快照
npm test -- -u
```

### CI失败
1. 检查Actions日志
2. 本地重现: `npm ci && npm test`
3. 检查Node版本兼容性

### 发布失败
1. 验证NPM_TOKEN有效性
2. 检查包名是否已存在
3. 验证版本号格式

## 📚 相关文档

- [Vitest文档](https://vitest.dev/)
- [GitHub Actions文档](https://docs.github.com/en/actions)
- [Codecov文档](https://docs.codecov.com/)
- [npm发布指南](https://docs.npmjs.com/packages-and-modules/contributing-packages-to-the-registry)

## 🎯 最佳实践

1. **测试命名**: 使用描述性的测试名称
2. **测试隔离**: 每个测试独立运行
3. **清理资源**: 使用afterEach清理临时文件
4. **Mock外部依赖**: 避免真实API调用
5. **覆盖率目标**: 保持>80%的代码覆盖率
6. **持续集成**: 确保所有测试在CI中通过
7. **版本管理**: 使用语义化版本

## 📞 获取帮助

- 查看 `tests/test-example.test.ts` 示例
- 阅读 `TESTING.md` 详细指南
- 提交Issue到GitHub仓库
