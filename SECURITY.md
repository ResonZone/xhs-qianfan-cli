# 安全边界

- 仅连接 `xiaohongshu.com` 与 `xhscdn.com` 第一方主机。
- 默认且当前仅允许 `risk=read` 的接口运行；`write` 和 `unknown` 会被拒绝。
- 默认使用命名的独立 Chrome Profile。Chrome 自己在 `chrome-user-data` 中持久化 Cookie/会话；CLI 不读取、解密、复制或导出 Cookie、token、密码、验证码、浏览历史、`storageState` 或浏览器数据库。
- 每个 Profile 的根目录和 Chrome 数据目录权限为 `0700`；`profile.json` 与 `runtime.json` 为 `0600`。前者仅保存名称、路径和存储方式，后者仅保存 PID、随机 CDP 端口与启动信息。
- Profile 只允许保存在当前用户本地磁盘，不允许放进 iCloud、`~/Library/CloudStorage`、OneDrive、Dropbox、共享盘或交付包。
- Profile CDP 使用 Chrome 随机端口并只绑定 `127.0.0.1`；CLI 校验 `DevToolsActivePort` 与浏览器声明的 WebSocket 路径，绝不连接非回环地址。
- 登录状态只通过浏览器页面内的 `GET /api/edith/seller/info/v2` 检查。密码、短信码和验证码均由用户本人处理；CLI 不自动填写、不绕过登录风控。
- 捕获文件只保留请求结构、脱敏后的请求体和响应字段形状，不保存 Cookie、Authorization、token、验证码、手机号、收件人或地址。
- 不实现越权枚举、验证码/设备风控绕过、高并发抓取、跨店铺访问或自动发布、退款、改价、库存和营销写入。
- 接口调用默认按 Profile 隔离缓存 600 秒；只有显式 `--refresh` 才绕过缓存。登录等待每 10 秒检查一次，不刷新页面；页面采证采用至少 15 秒间隔的单次导航，不做高频后台轮询。
- API 缓存包含完整接口响应，默认位于 `~/.config/xhs-qianfan-cli/cache`，目录/文件权限为 `0700/0600`。缓存属于账号内业务数据，不应同步、上传、提交到代码库或放入交付包；敏感场景使用 `--refresh --cache-ttl 0` 禁用本次缓存读取和写入。
- 账号权限、页面版本和接口契约可能变化；每次发布前需要重新执行账号内只读 E2E。
