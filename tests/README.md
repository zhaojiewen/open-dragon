# 测试文档

## 测试框架

本项目使用 **Vitest** 作为测试框架，它是专为 Vite 设计的快速单元测试框架，完美支持 TypeScript 和 ESM。

## 测试统计

- ✅ **测试文件**: 7 个
- ✅ **测试用例**: 60 个
- ✅ **通过率**: 100%
- 📊 **代码覆盖率**: 67.24%

## 测试结构

```
tests/
├── unit/                    # 单元测试
│   └── tools/              # 工具模块测试
│       ├── read.test.ts    # ReadTool 测试 (8个用例)
│       ├── write.test.ts   # WriteTool 测试 (8个用例)
│       ├── edit.test.ts    # EditTool 测试 (8个用例)
│       ├── bash.test.ts    # BashTool 测试 (9个用例)
│       ├── glob.test.ts    # GlobTool 测试 (6个用例)
│       └── registry.test.ts # ToolRegistry 测试 (11个用例)
└── test-example.test.ts    # 示例测试 (10个用例)
```

## 运行测试

### 运行所有测试
```bash
npm test
```

### 运行测试并生成覆盖率报告
```bash
npm run test:coverage
```

### 运行特定测试文件
```bash
npx vitest tests/unit/tools/read.test.ts
```

### 交互式测试 UI
```bash
npm run test:ui
```

### 监听模式
```bash
npx vitest watch
```

## 测试覆盖率详情

| 模块 | 语句覆盖 | 分支覆盖 | 函数覆盖 | 行覆盖 |
|------|---------|---------|---------|--------|
| **所有文件** | 67.24% | 59% | 65.51% | 67.41% |
| base.ts | 100% | 100% | 100% | 100% |
| bash.ts | 100% | 90.9% | 100% | 100% |
| edit.ts | 96.66% | 100% | 100% | 96.66% |
| glob.ts | 93.33% | 80% | 100% | 92.85% |
| read.ts | 95.83% | 100% | 100% | 95.83% |
| write.ts | 93.75% | 100% | 100% | 93.75% |
| index.ts | 100% | 77.77% | 100% | 100% |

## 测试用例说明

### ReadTool 测试
- ✅ 验证工具名称和描述
- ✅ 成功读取文件
- ✅ 文件不存在时失败
- ✅ 路径是目录时失败
- ✅ 使用 offset 和 limit 参数
- ✅ 处理相对路径
- ✅ 输出包含行号
- ✅ 参数验证

### WriteTool 测试
- ✅ 验证工具名称和描述
- ✅ 写入新文件
- ✅ 覆盖现有文件
- ✅ 创建嵌套目录
- ✅ 处理相对路径
- ✅ 报告字符数
- ✅ 验证必需参数
- ✅ 处理空内容

### EditTool 测试
- ✅ 验证工具名称和描述
- ✅ 替换单个匹配项
- ✅ 使用 replace_all 替换所有
- ✅ 字符串不存在时失败
- ✅ 文件不存在时失败
- ✅ 多个匹配项但未使用 replace_all 时失败
- ✅ 处理相对路径
- ✅ 参数验证

### BashTool 测试
- ✅ 验证工具名称和描述
- ✅ 执行简单命令
- ✅ 在工作目录执行命令
- ✅ 捕获 stderr
- ✅ 处理命令失败
- ✅ 处理不存在的命令
- ✅ 支持 timeout 参数
- ✅ 无输出时返回成功消息
- ✅ 参数验证

### GlobTool 测试
- ✅ 验证工具名称和描述
- ✅ 查找匹配模式的文件
- ✅ 递归模式查找
- ✅ 未找到文件时返回消息
- ✅ 使用自定义搜索路径
- ✅ 参数验证

### ToolRegistry 测试
- ✅ 创建包含默认工具的注册表
- ✅ 设置和获取 provider
- ✅ 按启用列表过滤工具
- ✅ 无过滤时返回所有工具
- ✅ 执行工具调用
- ✅ 返回未知工具的错误
- ✅ 处理工具执行错误
- ✅ 更新工作目录
- ✅ 工具定义格式正确
- ✅ 使用默认工作目录创建注册表
- ✅ 使用自定义工作目录创建注册表

## 测试最佳实践

### 1. 使用临时目录
```typescript
import fs from 'fs';
import path from 'path';
import os from 'os';

let tempDir: string;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-'));
});

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});
```

### 2. 参数验证测试
```typescript
it('should validate required parameters', async () => {
  await expect(
    tool.execute({})
  ).rejects.toThrow('Invalid parameters');
});
```

### 3. 测试成功和失败场景
```typescript
it('should succeed with valid input', async () => {
  const result = await tool.execute({ /* valid params */ });
  expect(result.success).toBe(true);
});

it('should fail with invalid input', async () => {
  const result = await tool.execute({ /* invalid params */ });
  expect(result.success).toBe(false);
  expect(result.error).toBeDefined();
});
```

## 持续集成

建议在 CI/CD 流程中添加测试步骤：

```yaml
# .github/workflows/test.yml
name: Test

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run tests
        run: npm test
      
      - name: Generate coverage
        run: npm run test:coverage
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3
```

## 未来改进

### 需要增加的测试
1. **Provider 层测试**
   - 各个 AI 提供商的实现测试
   - 消息格式化测试
   - 流式响应测试

2. **Config 层测试**
   - 配置加载和验证
   - 配置初始化
   - 配置保存

3. **Error 处理测试**
   - 自定义错误类型
   - 错误包装和转换

4. **REPL 交互测试**
   - 命令解析
   - 消息历史管理

5. **集成测试**
   - 完整的工作流测试
   - 多工具协作测试

### 提高覆盖率目标
- 当前: 67.24%
- 短期目标: 80%
- 长期目标: 90%+

## 相关命令

```bash
# 查看测试覆盖率详情
npm run test:coverage

# 打开 HTML 覆盖率报告
open coverage/index.html

# 运行特定测试
npx vitest tests/unit/tools/read.test.ts

# 更新快照
npx vitest -u
```
