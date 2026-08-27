import { readFile, writeFile } from "node:fs/promises";

const catalog = JSON.parse(await readFile(new URL("../catalog/endpoints.json", import.meta.url), "utf8"));
const menu = JSON.parse(await readFile(new URL("../catalog/menu.json", import.meta.url), "utf8"));
const domainOrder = menu.groups.map((group) => group.domain);
const labels = Object.fromEntries(menu.groups.map((group) => [group.domain, group.name]));
labels.common = "公共壳层";
const runnableEndpoints = catalog.endpoints.filter((endpoint) => endpoint.runnable && endpoint.risk === "read");
const blockedEndpoints = catalog.endpoints.filter((endpoint) => !endpoint.runnable || endpoint.risk !== "read");

const lines = [
  "# 小红书千帆 CLI 接口目录",
  "",
  `> 生成时间：${catalog.generatedAt}`,
  "> 证据等级：当前账号、Chrome CDP、正常页面加载中观察；仅列出 `risk=read` 且 HTTP 200 的可运行项。CLI v0.3 默认从命名专用 Profile 复用浏览器登录态。",
  "",
  "接口结果默认缓存 600 秒；只有显式 `--refresh` 才重新请求。带 `[RESOURCE_OR_SECRET]` 的示例要求调用者提供当前账号可见的资源 ID。",
  "",
];

for (const domain of ["common", ...domainOrder]) {
  const endpoints = runnableEndpoints.filter((endpoint) => endpoint.domains.includes(domain));
  if (!endpoints.length) continue;
  lines.push(`## ${labels[domain] || domain}`, "", `共 ${endpoints.length} 项。`, "");
  lines.push("| ID | 方法 | 路径/操作 | 输入 | 源码证据 |", "|---|---|---|---|---|");
  for (const endpoint of endpoints) {
    const route = endpoint.operation ? `${endpoint.path}<br>type=${endpoint.operation}` : endpoint.path;
    const input = [
      endpoint.query.length ? `query: ${endpoint.query.join(", ")}` : "",
      endpoint.body.length ? `body: ${endpoint.body.join(", ")}` : "",
    ].filter(Boolean).join("<br>") || "无";
    const source = endpoint.sourceFiles.length
      ? endpoint.sourceFiles.map((item) => `${item.app}/${item.file}`).join("<br>")
      : "仅运行时证据";
    lines.push(`| \`${endpoint.id}\` | ${endpoint.method} | \`${route}\` | ${input} | ${source} |`);
  }
  lines.push("");
}

if (blockedEndpoints.length) {
  lines.push("## 已观察但禁止通用调用", "", "以下接口只用于解释受控流程，不允许通过 `qianfan api call` 执行。", "");
  lines.push("| ID | 方法 | 路径 | 风险 | 原因 |", "|---|---|---|---|---|");
  for (const endpoint of blockedEndpoints) {
    lines.push(`| \`${endpoint.id}\` | ${endpoint.method} | \`${endpoint.path}\` | ${endpoint.risk} | ${endpoint.description || "未通过只读门禁"} |`);
  }
  lines.push("");
}

lines.push(
  "## 调用示例",
  "",
  "```bash",
  "qianfan profile login default",
  "qianfan profile status default",
  "qianfan api call overview.business-data-realtime-overview-v2",
  "qianfan 商品 ops",
  "```",
  "",
  "完整参数示例通过 `qianfan api show <ID>` 查看。静态候选通过 `qianfan api candidates --domain <domain>` 查看，但不可执行。",
  "",
);

await writeFile(new URL("../docs/API.md", import.meta.url), `${lines.join("\n")}\n`);
process.stdout.write(`${JSON.stringify({ output: "docs/API.md", observedEndpoints: catalog.endpoints.length, runnableEndpoints: runnableEndpoints.length, blockedEndpoints: blockedEndpoints.length }, null, 2)}\n`);
