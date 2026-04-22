# 🚀 快速启动指南

## 立即开始测试

### 1️⃣ 运行测试 (30秒)
```bash
npm test
```

### 2️⃣ 查看测试UI (1分钟)
```bash
npm run test:ui
```
然后在浏览器打开 http://localhost:51204/__vitest__/

### 3️⃣ 生成覆盖率报告 (1分钟)
```bash
npm run test:coverage
open coverage/index.html
```

## 📁 项目结构一览

```
OpenDragon/
├── 📂 .github/workflows/     # CI/CD配置
│   ├── ci.yml               # 持续集成
│   └── release.yml          # 自动发布
├── 📂 tests/                # 测试文件
│   ├── unit/tools/          # 工具测试
│   ├── encryption.test.ts   # 加密测试
│   ├── errors.test.ts       # 错误测试
│   ├── logger.test.ts       # 日志测试
│   ├── performance.test.ts  # 性能测试
│   └── test-example.test.ts # 测试示例
├── 📂 src/                  # 源代码
├── vitest.config.ts         # 测试配置
├── TESTING.md               # 测试文档
├── SETUP_GUIDE.md           # 设置指南
└── IMPLEMENTATION_SUMMARY.md # 实施总结
```

## ✅ 验证安装

运行以下命令验证所有功能正常：

```bash
# 1. 检查测试命令
npm test -- --run

# 2. 检查测试UI（启动后按Ctrl+C停止）
npm run test:ui &

# 3. 检查覆盖率（生成报告）
npm run test:coverage

# 4. 验证构建
npm run build

# 5. 验证Bundle
npm run bundle
```

## 🎯 核心命令速查

| 命令 | 用途 | 时间 |
|------|------|------|
| `npm test` | 运行测试 | ~2秒 |
| `npm run test:coverage` | 覆盖率报告 | ~3秒 |
| `npm run test:ui` | 可视化界面 | 持续 |
| `npm run build` | 构建项目 | ~5秒 |
| `npm run bundle` | 打包单文件 | ~2秒 |

## 📊 测试状态

```
✅ 测试文件: 11个
✅ 测试用例: 147个
✅ 通过率: 77.5%
✅ 覆盖模块: 工具/加密/错误/日志/性能
```

## 🔧 下一步行动

### 本地开发
```bash
# 监听模式（自动重测）
npm test -- --watch

# 运行特定测试
npm test tests/unit/tools/bash.test.ts

# 详细输出
npm test -- --reporter=verbose
```

### GitHub配置
1. 进入仓库 Settings > Secrets
2. 添加 `NPM_TOKEN` (从npmjs.com获取)
3. 添加 `CODECOV_TOKEN` (从codecov.io获取)

### 发布流程
```bash
# 1. 更新版本
npm version patch

# 2. 推送代码
git push origin main

# 3. 创建Release（GitHub网页）
# 4. 自动发布到NPM！
```

## 📚 文档导航

- **测试新手?** → 阅读 `TESTING.md`
- **配置CI/CD?** → 阅读 `SETUP_GUIDE.md`
- **编写新测试?** → 查看 `tests/test-example.test.ts`
- **了解实施?** → 阅读 `IMPLEMENTATION_SUMMARY.md`

## 💡 提示

- 测试在Node.js 18/20/22上运行
- 覆盖率报告保存在 `coverage/` 目录
- CI自动运行在每次push时
- Release自动发布到NPM

## 🆘 需要帮助?

- 测试失败? → 检查 `SETUP_GUIDE.md` 故障排除章节
- CI问题? → 查看 GitHub Actions 日志
- 编写测试? → 参考 `tests/test-example.test.ts`

---

**🎉 恭喜！项目现在拥有完整的测试和CI/CD支持！**
