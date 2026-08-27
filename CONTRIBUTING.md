# 贡献指南

本项目只接受小红书千帆当前授权账号范围内的低频、只读能力。任何代码、接口目录或文档变更都必须保持凭证不落库、写操作先拒绝和证据等级不升级三条边界。

## 准备开发环境

```bash
npm install
npm run check
npm test
npm run build
```

运行要求是 Node.js 20 或更高版本。CLI 使用本机 Chrome、Edge 或 Chromium，不下载或捆绑浏览器 Profile。

## 修改 CLI

运行源码入口：

```bash
npm run dev -- --help
```

修改后至少执行：

```bash
npm run check
npm test
npm run build
node dist/src/index.js --version
```

不得在测试中使用真实 Cookie、token、账号、手机号、资源 ID 或业务响应。需要资源值时使用：

```text
[RESOURCE_OR_SECRET]
[REDACTED]
redacted
```

## 修改接口目录

接口状态含义：

| 状态 | 是否可调用 | 要求 |
|---|---|---|
| `observed` | 仅在 `runnable=true` 且 `risk=read` 时 | 具有当前账号、当前前端版本的运行时证据 |
| `static` | 否 | 只在前端代码或配置中发现 |
| `candidate` | 否 | 历史、规则或相邻页面推导 |

不能因为静态字符串、HTTP 200、页面成功打开或单个参数成功，就把候选接口升级成平台全量可用接口。写入、任务创建、删除、发布、审批、授权和配置变更保持不可运行。

生成 API 文档：

```bash
node scripts/generate-api-docs.mjs
```

构建时 `scripts/copy-assets.mjs` 会把运行目录需要的六个目录文件复制到 `dist/catalog`。

## 处理 Profile 和缓存

- 不提交 `~/.config/xhs-qianfan-cli`；
- 不提交 `chrome-user-data`、`profile.json`、`runtime.json` 或 `DevToolsActivePort`；
- 不提交 `.playwright-cli`、截图、页面快照或浏览器日志；
- 不提交 API 缓存；缓存包含完整账号内业务响应；
- 不提交 `work/` 采证目录和 `outputs/` 本地交付目录；
- 登录、密码、短信码和验证码只能由用户本人在专用浏览器完成。

## 提交前检查

```bash
npm run check
npm test
npm run build
git status --short
git diff --check
```

还应确认：

- README 示例与 `qianfan --help`、`api show` 一致；
- 没有真实凭证、用户标识、本机绝对路径或原始业务响应；
- 新增接口有 Evidence → Finding → Path 证据链；
- Windows 相关变更没有在缺少真机证据时标记为 E2E 通过；
- 发布包不含 Profile、缓存、证据目录或本地日志。
