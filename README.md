# 小红书千帆 CLI

面向小红书千帆 PC 商家后台的可审计、低频、只读命令行工具。CLI 默认通过本机专用 Chrome Profile 复用用户已授权的登录会话，并按商品、流量、直播、笔记、交易、搜索、市集、店铺、服务、市场和营销等业务域提供接口目录与调用入口。

> 当前版本：`0.3.0-beta.1`。只允许执行同时满足 `evidence=observed`、`runnable=true`、`risk=read` 的操作。当前覆盖结论仅适用于采证时的账号权限与前端版本，不代表小红书平台全部角色、全部隐藏接口或任意参数组合。

> 平台状态：macOS Chrome 专用 Profile 与外部 CDP 已完成真实 E2E；Windows 当前是工程预览，尚未完成真机 E2E。Windows 用户先阅读 [Windows 工程预览](./docs/WINDOWS.md)。

## 快速开始

使用导出的 npm 安装包：

```bash
npm install -g ./xhs-qianfan-cli-0.3.0-beta.1.tgz
qianfan --version
qianfan profile login default
qianfan api call overview.business-data-realtime-overview-v2
```

首次登录时，CLI 会打开独立 Chrome 窗口。账号、密码、短信码和验证码必须由用户本人输入。登录成功后，会话由 Chrome 保存在 `default` Profile；以后直接执行 `qianfan api call ...` 即可自动启动该 Profile。

当前用户如果已经创建并登录过 `default` Profile，重新安装 CLI 不会删除它，也不需要把凭证装进 npm 包。

## 能做什么

当前接口目录来自真实登录账号的低频页面采证与当前 JavaScript 微应用分析：

| 覆盖项 | 数量 | 含义 |
|---|---:|---|
| 动态观察操作 | 138 | 当前账号和前端版本中实际观察到的方法、路径与参数结构 |
| 可运行只读操作 | 137 | 同时通过 observed、runnable 和 read 三层门禁 |
| 被阻止任务接口 | 1 | 已观察，但属于服务端任务创建，保持 `risk=write` |
| 去重真实路径 | 52 | 多个 Butterfly 操作可能复用同一路径 |
| Butterfly 业务操作 | 87 | 已按 `type` 或 `blockKey` 拆分 |
| 具有源码定位的动态操作 | 113 | 可定位到当前前端 chunk |
| 静态候选 | 1,926 | 已分类，但未动态观察的候选不会冒充可调用接口 |
| 恢复请求方法的静态候选 | 431 | 仍需动态证据才能运行 |
| 恢复参数 schema 的静态候选 | 433 | 仍需动态证据才能运行 |

138 个动态操作中，19 个为零输入，119 个带参数。所有带参数操作都已经进入明确验证终态，但这不等于尝试了无限多的日期、字符串、资源 ID 和筛选条件笛卡尔积。

## 安装

运行环境：

- Node.js 20 或更高版本；
- macOS：Google Chrome、Microsoft Edge 或 Chromium；
- Linux：Google Chrome 或 Chromium；
- Windows 工程预览：Google Chrome；Windows 真机 E2E 尚未完成；
- 如果浏览器不在默认路径，设置 `QIANFAN_BROWSER_EXECUTABLE`。

从导出包安装：

```bash
npm install -g ./xhs-qianfan-cli-0.3.0-beta.1.tgz
qianfan --version
qianfan --help
```

从源码安装或开发：

```bash
npm install
npm run check
npm test
npm run build
npm link
```

升级到新的本地包：

```bash
npm install -g ./xhs-qianfan-cli-0.3.0-beta.1.tgz
```

卸载 CLI：

```bash
npm uninstall -g xhs-qianfan-cli
```

卸载 npm 包不会自动删除 `~/.config/xhs-qianfan-cli`，因此不会误删专用 Chrome Profile、登录会话或本地缓存。如需清理这些本地数据，应先确认精确 Profile 和缓存范围，再单独处理。

## 使用专用 Profile

命名 Profile 是默认凭证容器。Chrome 自己保存 Cookie 和会话；CLI 不读取、不解密、不复制、不导出 Cookie、token、密码、验证码或 `storageState`。

创建并查看 Profile：

```bash
qianfan profile create default
qianfan profile list
```

首次登录或重新登录：

```bash
qianfan profile login default
```

登录等待默认 300 秒，可设置为 0–900 秒：

```bash
qianfan profile login default --wait 600
```

等待期间每 10 秒检查一次 `GET /api/edith/seller/info/v2`，不会循环刷新页面，也不会自动填写账号、密码、短信码或验证码。

检查、启动和停止：

```bash
qianfan profile start default
qianfan profile status default
qianfan profile stop default
```

`profile stop` 只停止专用浏览器，Chrome Profile 和登录会话继续保留。浏览器已停止时，`profile status` 返回 `status=stopped`；这不等于登录会话已经失效。接口调用会自动启动 Profile 并重新检查登录。

Profile 命名规则：1–64 个字母、数字、点、下划线或连字符，首字符必须是字母或数字。

### 多店铺或多账号

每个账号使用独立 Profile：

```bash
qianfan profile create shop-a
qianfan profile login shop-a

qianfan profile create shop-b
qianfan profile login shop-b
```

调用时指定账号：

```bash
qianfan api call overview.business-data-realtime-overview-v2 \
  --browser profile \
  --profile shop-a
```

不同 Profile 的缓存键相互隔离，不会把 `shop-a` 的缓存复用给 `shop-b`。

### Profile 本地结构

```text
~/.config/xhs-qianfan-cli/profiles/<name>/
├── profile.json          # 0600，仅名称、路径和存储方式
├── runtime.json          # 0600，仅运行时 PID、端口与浏览器信息
└── chrome-user-data/     # 0700，Chrome 自己管理登录会话
```

Profile 根目录和 Chrome 数据目录为 `0700`，元数据与运行状态文件为 `0600`。Profile 不允许放在 iCloud、`~/Library/CloudStorage`、OneDrive、Dropbox 等同步目录。

### 登录状态和退出码

| 结果 | 退出码 | 处理方式 |
|---|---:|---|
| `status=valid` | 0 | 可以调用只读接口 |
| `status=login_required` | 3 | 运行 `qianfan profile login <name>` 并由用户完成登录 |
| `status=stopped` | 3 | 运行 `profile start`，或直接执行接口让 CLI 自动启动 |
| Profile/CDP 故障 | 2 | 检查浏览器路径、Profile 占用和回环 CDP |
| 参数、目录或风险门禁错误 | 1 | 按 stderr 修正命令；写接口不会启动浏览器 |

## 查看接口目录

列出全部动态观察接口：

```bash
qianfan api list
```

只看一个业务域：

```bash
qianfan api list --domain product
qianfan 商品 ops
qianfan 直播 ops
```

查看某个操作的请求方法、参数、示例、源码与证据：

```bash
qianfan api show overview.business-data-realtime-overview-v2
qianfan api show shop.seller-core-page-flow
```

查看静态候选：

```bash
qianfan api candidate-stats
qianfan api candidates --domain livestream
qianfan api candidate-show /api/edith/business_data/realtime_overview_v2
```

静态候选不可直接调用。只有目录中 `evidence=observed`、`runnable=true`、`risk=read` 的操作才会通过执行门禁。

查看覆盖矩阵和参数状态：

```bash
qianfan coverage stats
qianfan coverage static --domain product --state STATIC_READ_CANDIDATE
qianfan coverage observed --domain livestream
qianfan coverage parameter-gaps
qianfan coverage parameters
qianfan coverage parameters --all
```

完整的 137 个只读操作目录见 [docs/API.md](./docs/API.md)。

## 调用只读接口

无参数 GET：

```bash
qianfan api call overview.business-data-realtime-overview-v2
```

带 query 参数：

```bash
qianfan api call product.business-data-realtime-item-v2 \
  --profile default \
  --query '{"displayViewType":2,"orderField":"payGmv","sortType":"desc","pageNo":1,"pageSize":10,"total":0,"filterValue":""}'
```

带 JSON body 的 POST：

```bash
qianfan api call shop.seller-core-page-flow \
  --profile default \
  --body '{"dateSelectType":"recent_1","dateType":1,"userType":"all","cycle":0}'
```

按业务域执行：

```bash
qianfan 商品 run business-data-realtime-item-v2 \
  --profile default \
  --query '{"displayViewType":2,"orderField":"payGmv","sortType":"desc","pageNo":1,"pageSize":10,"total":0,"filterValue":""}'
```

需要资源 ID、直播 ID、类目 ID 等参数时，`api show` 的示例会使用 `[RESOURCE_OR_SECRET]`。调用者必须提供当前 Profile 对应账号有权访问的真实资源值；CLI 不提供跨账号枚举或自动猜测。

### 读取输出

未命中缓存时，stdout 结构为：

```json
{
  "cached": false,
  "value": {
    "endpoint": "overview.business-data-realtime-overview-v2",
    "method": "GET",
    "url": "https://ark.xiaohongshu.com/api/edith/business_data/realtime_overview_v2",
    "status": 200,
    "ok": true,
    "contentType": "application/json",
    "data": {}
  }
}
```

命中缓存时返回 `cached=true` 和 `cachedAt`。接口 HTTP 失败不会自动重试；脚本调用方应同时检查 `value.status` 与 `value.ok`，不要只检查 CLI 进程是否启动成功。

## 业务域

命令与当前千帆菜单一致：

| 中文命令 | 英文命令 | 已观察接口数 |
|---|---|---:|
| 总览 | `overview` | 8 |
| 商品 | `product` | 8 |
| 流量 | `traffic` | 5 |
| 直播 | `livestream` | 16 |
| 笔记 | `note` | 14 |
| 交易 | `trade` | 28 |
| 搜索 | `search` | 7 |
| 市集 | `marketplace` | 5 |
| 店铺 | `shop` | 9 |
| 服务 | `service` | 13 |
| 市场 | `market` | 3 |
| 营销 | `marketing` | 8 |

各域包含少量复用接口，因此表中数量不能相加作为去重总数。去重动态操作总数是 138，其中公共壳层/框架接口为 22，非公共业务操作或受控任务接口为 116。

中文别名可以直接运行：

```bash
qianfan 商品 ops
qianfan 流量 ops
qianfan 直播 ops
qianfan 笔记 ops
qianfan 交易 ops
qianfan 搜索 ops
qianfan 市集 ops
qianfan 店铺 ops
qianfan 服务 ops
qianfan 市场 ops
qianfan 营销 ops
```

## 控制请求频率和缓存

默认缓存 600 秒。同一浏览器模式、Profile、接口和参数在缓存期内不会再次请求千帆：

```bash
qianfan api call overview.business-data-realtime-overview-v2
qianfan api call overview.business-data-realtime-overview-v2
```

第二次调用返回 `cached=true`。只有确实需要最新数据时才绕过缓存：

```bash
qianfan api call overview.business-data-realtime-overview-v2 --refresh
```

调整缓存时间，范围为 0–86,400 秒：

```bash
qianfan api call overview.business-data-realtime-overview-v2 --cache-ttl 900
```

完全禁用本次缓存读取和写入：

```bash
qianfan api call overview.business-data-realtime-overview-v2 \
  --refresh \
  --cache-ttl 0
```

低频门禁：

- 不做页面刷新循环；
- 登录等待每 10 秒检查一次，不刷新页面；
- 页面采证业务动作至少间隔 15 秒；
- HTTP 4xx/5xx 不自动重试；
- 网络失败最多重试一次，且延迟 60 秒；
- 不做高并发参数枚举。

缓存文件位于 `QIANFAN_CONFIG_DIR/cache`，默认是 `~/.config/xhs-qianfan-cli/cache`，权限为 `0700/0600`。缓存会包含接口响应正文，应按业务数据管理，不要同步、上传或加入交付包。

## 选择浏览器模式

| 模式 | 命令 | 用途 |
|---|---|---|
| 命名 Profile | `--browser profile --profile default` | 默认；凭证与缓存按 Profile 隔离 |
| 外部 Chrome | `--browser external` | 兼容已打开、已登录的外部 Chrome |
| 旧托管浏览器 | `--browser managed` | 兼容 v0.2 之前的单一托管目录 |

外部 Chrome 兼容模式：

```bash
qianfan browser attach-external
qianfan browser external-status
qianfan api call overview.business-data-realtime-overview-v2 --browser external
```

第一次连接外部 Chrome 时，浏览器可能显示“允许远程调试”确认。CLI 只选择 `ark.xiaohongshu.com` 页面，不导出 Cookie，也不会通过该模式关闭用户的外部 Chrome。

旧托管浏览器模式：

```bash
qianfan browser start
qianfan browser status
qianfan api call overview.business-data-realtime-overview-v2 --browser managed
qianfan browser stop
```

`capture` 是高级采证命令，当前使用旧托管浏览器连接，需要先运行 `qianfan browser start`：

```bash
qianfan capture \
  --domain livestream \
  --seconds 60 \
  --output evidence.json
```

捕获文件只保留脱敏后的请求结构和响应字段形状，但仍应作为私有证据管理。

## 配置

| 环境变量 | 默认值 | 作用范围 |
|---|---|---|
| `QIANFAN_CONFIG_DIR` | `~/.config/xhs-qianfan-cli` | 命名 Profile、缓存和旧托管运行状态根目录 |
| `QIANFAN_BROWSER_EXECUTABLE` | 自动发现 | 指定 Chrome、Edge 或 Chromium 可执行文件 |
| `QIANFAN_EXTERNAL_SESSION` | `qianfan-external` | 外部 Chrome Playwright 会话名称 |
| `QIANFAN_PLAYWRIGHT_CLI` | `playwright-cli` | 外部 Chrome 兼容模式的 CLI 路径 |
| `QIANFAN_PROFILE_DIR` | `<config>/browser-profile` | 仅旧托管浏览器模式 |
| `QIANFAN_CDP_PORT` | `9333` | 仅旧托管浏览器模式；范围 1024–65535 |

命名 Profile 始终使用 Chrome 分配的随机 CDP 端口，并只绑定 `127.0.0.1`。`QIANFAN_EXTERNAL_CDP` 是内部子进程参数，不建议手工设置。

## 故障排查

| 现象或错误 | 原因 | 处理方式 |
|---|---|---|
| `status=stopped` | Profile 浏览器未运行 | 直接执行接口自动启动，或运行 `qianfan profile start <name>` |
| `QIANFAN_LOGIN_REQUIRED` | 登录失效、跳转登录页或业务门禁失败 | 运行 `qianfan profile login <name>`，由用户完成登录 |
| `No supported Chrome...` | 浏览器不在默认路径 | 设置 `QIANFAN_BROWSER_EXECUTABLE` 为可执行文件绝对路径 |
| `Profiles must stay on local disk` | Profile 位于云同步目录 | 把 `QIANFAN_CONFIG_DIR` 改为当前用户本机非同步路径 |
| `Endpoint ... needs --query` | 缺少已观察 query 参数 | 运行 `qianfan api show <id>`，按示例传入 JSON 对象 |
| `Endpoint ... needs --body` | 缺少已观察 JSON body | 运行 `qianfan api show <id>`，按示例传入 JSON 对象 |
| `catalog-only` | 接口未通过动态可运行门禁 | 只能查看目录和证据，不可调用 |
| `risk is write` | 接口可能创建、修改或提交数据 | CLI 在启动 Profile/CDP 前拒绝执行 |
| `Unknown ... operation` | ID 或业务域操作名不匹配 | 运行 `qianfan api list` 或 `qianfan <业务域> ops` |
| HTTP `ok=false` | 平台权限、参数、灰度或服务错误 | 记录状态与输入；4xx/5xx 不自动重试，不用其他结果覆盖失败 |

如果 `profile stop` 返回成功，可再运行 `qianfan profile list`，确认对应 Profile 为 `running=false`。CLI 会在停止前发送专用浏览器关闭命令，并复查 CDP 端口已经关闭。

## 安全和数据边界

- 只允许 `xiaohongshu.com` 与 `xhscdn.com` 第一方主机；
- 只执行 `risk=read` 操作，`write` 和 `unknown` 会在浏览器连接前拒绝；
- 不读取、复制或导出 Cookie、token、密码、验证码、浏览历史或浏览器数据库；
- 不跨账号，不枚举无权访问的资源 ID，不绕过验证码或设备风控；
- 不实现发布、退款、改价、库存、审批、授权或营销写入；
- stdout 与本地缓存可能包含账号内业务响应，应按敏感业务数据管理；
- npm 包、README、API 目录、报告和校验和不包含本机 Profile、缓存或账号响应；
- 当前账号的 HTTP 200、工程回归和 CLI E2E 不等于业务 Owner、法务或生产验收。

更完整的安全说明见 [SECURITY.md](./SECURITY.md)。

## 验证导出包

macOS 或 Linux：

```bash
shasum -a 256 -c SHA256SUMS-v0.3.txt
```

检查 npm 包内容但不安装：

```bash
tar -tzf xhs-qianfan-cli-0.3.0-beta.1.tgz
```

安装到临时环境后至少检查：

```bash
qianfan --version
qianfan profile create installed-smoke
qianfan profile list
qianfan coverage stats
```

导出包应包含 CLI 运行文件、Profile 辅助进程、覆盖矩阵、参数报告、README、SECURITY 和 API 文档，不应包含 `~/.config/xhs-qianfan-cli`、Cookie、token、缓存或真实接口响应。

## 命令速查

```text
qianfan profile create|list|start|login|status|stop
qianfan browser attach-external|external-status
qianfan browser start|status|stop
qianfan auth login|status [--profile <name>]
qianfan api list|show|call
qianfan api candidates|candidate-stats|candidate-show
qianfan coverage stats|static|observed|parameter-gaps|parameters
qianfan capture --domain <业务域> --seconds 60 --output evidence.json
qianfan 总览|商品|流量|直播|笔记|交易|搜索|市集|店铺|服务|市场|营销 ops
qianfan <业务域> run <operation> --profile <name> --query '{...}' --body '{...}'
```

## 证据等级和完成边界

- `observed`：当前账号、当前前端版本中实际观察到方法、路径、参数结构和 HTTP 状态；通过只读门禁后可以执行。
- `static`：只在当前 JavaScript bundle 中发现；不可运行。
- `candidate`：历史包、配置或静态规则推导；不可运行。

静态字符串、HTTP 200、页面加载成功、参数分区成功、CLI 调用成功、业务验收和生产上线是不同证据层级。直播达人趋势的一个日期变体保留 HTTP 500 原始验证状态，没有重试，也没有用其他成功结果覆盖它。

本项目不声称覆盖：其他商家账号、子账号角色、服务商角色、平台内部权限、当前前端未暴露接口、无限参数组合、写操作生产执行或业务口径终审。

## 文档

- [API 目录](./docs/API.md)
- [Windows 工程预览](./docs/WINDOWS.md)
- [安全边界](./SECURITY.md)
- [贡献指南](./CONTRIBUTING.md)
- `catalog/coverage-matrix.json`：1,926 条静态候选和 138 个动态操作的状态矩阵
- `catalog/parameter-validation.json`：全部动态操作的参数验证终态
