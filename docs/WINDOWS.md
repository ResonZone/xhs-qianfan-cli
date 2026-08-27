# Windows 工程预览

> 当前状态：`WINDOWS_ENGINEERING_PREVIEW`、`WINDOWS_REAL_E2E_PENDING`。现有 CLI 包含 Windows 分支和跨平台 Profile 逻辑，但尚未在真实 Windows 电脑完成登录、接口调用、缓存、关闭和重启后的完整验收，不能标记为 Windows 生产可用。

## 当前支持范围

当前代码已具备：

- Node.js 命令行入口；
- 独立 Chrome `--user-data-dir`；
- `--remote-debugging-address=127.0.0.1`；
- `--remote-debugging-port=0` 随机端口；
- `DevToolsActivePort` 读取和回环 WebSocket 校验；
- 页面内登录状态检查；
- 用户本人处理账号、密码、短信码和验证码；
- Windows PID 停止分支；
- `QIANFAN_BROWSER_EXECUTABLE` 手工浏览器路径；
- OneDrive 和 Dropbox 路径字符串门禁。

尚未完成：

- Windows Chrome/Edge 全安装位置自动发现；
- `%LOCALAPPDATA%` 原生默认配置目录；
- Windows ACL 收紧与回读；
- UNC、网络盘和企业同步盘完整识别；
- Windows 进程树与 Profile 锁释放真机验证；
- Windows 外部 Chrome 接管 E2E；
- Windows 真实账号登录和接口 E2E。

## 工程预览用法

安装 Node.js 20 或更高版本，并安装 Google Chrome。下载 release 中的 tgz 后，在 PowerShell 运行：

```powershell
npm install -g .\xhs-qianfan-cli-0.3.0-beta.1.tgz
qianfan --version
```

如果 CLI 没有自动找到 Chrome，显式设置当前终端的路径：

```powershell
$env:QIANFAN_BROWSER_EXECUTABLE = "C:\Program Files\Google\Chrome\Application\chrome.exe"
```

用户级 Chrome 可以尝试：

```powershell
$env:QIANFAN_BROWSER_EXECUTABLE = "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
```

使用 Edge 时必须手工指定：

```powershell
$env:QIANFAN_BROWSER_EXECUTABLE = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
```

创建并登录专用 Profile：

```powershell
qianfan profile create default
qianfan profile login default --wait 600
```

登录窗口中的账号、密码、短信码和验证码由用户本人输入。验证状态：

```powershell
qianfan profile status default
```

调用只读接口：

```powershell
qianfan api call overview.business-data-realtime-overview-v2 `
  --browser profile `
  --profile default
```

停止专用浏览器但保留 Profile：

```powershell
qianfan profile stop default
qianfan profile list
```

## 安全要求

- Profile 必须保存在当前 Windows 用户的本机磁盘；
- 不要把 Profile 放进 OneDrive、共享盘、NAS、UNC 路径或企业同步目录；
- 不要复制、压缩或上传 `chrome-user-data`；
- 不要导出 Cookie 或 `storageState`；
- 同一 Profile 不能由两个浏览器实例同时打开；
- CDP 只能绑定 `127.0.0.1`，不能暴露到局域网或公网；
- API 缓存包含账号内业务响应，不应同步或提交到代码仓库；
- 会话失效时重新运行 `profile login`，不绕过平台验证。

Windows 上的 POSIX `0700/0600` 不能作为 ACL 已收紧的证明。正式启用前，应使用 `icacls` 或企业端点管理工具确认只有目标 Windows 用户和授权管理员可以读取 Profile 与缓存目录。

## 校验下载文件

在包含 tgz 和校验和文件的目录运行：

```powershell
Get-FileHash .\xhs-qianfan-cli-0.3.0-beta.1.tgz -Algorithm SHA256
Get-Content .\SHA256SUMS-v0.3.txt
```

当前 `0.3.0-beta.1` tgz 的 SHA-256 为：

```text
0e0ab5eec33354c22b95a49b5d9a0fa1d76eb85d239960c721d43fbc48721e6a
```

## Windows 真机验收清单

只有以下项目全部取得证据后，才能把状态升级为 `WINDOWS_REAL_E2E_PASS`：

1. 记录 Windows、Node.js 和 Chrome/Edge 版本；
2. 从 tgz 完成独立 npm 安装；
3. 创建专用 Profile；
4. 用户本人登录并得到 HTTP 200、业务 `code=0`；
5. 调用一个目录内只读接口并得到 `ok=true`；
6. 第二次相同调用命中 600 秒缓存；
7. 停止浏览器并确认主进程、子进程和 CDP 端口关闭；
8. 重启 Profile 并确认登录态仍有效；
9. 确认没有 Profile 锁占用；
10. 回读 Profile 和缓存 ACL；
11. 扫描提交与 release，确认没有 Cookie、token、Profile、缓存或真实响应；
12. 保存退出码、文件哈希和脱敏后的验收记录。

在这套门禁完成前，Windows 用法只用于工程试运行，不用于生产承诺。
