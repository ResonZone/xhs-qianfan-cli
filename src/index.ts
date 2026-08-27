#!/usr/bin/env node
import { Command } from "commander";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { assertRunnableEndpoint, executeEndpoint } from "./api.js";
import { connectBrowser, browserStatus, qianfanPage, startBrowser, stopBrowser } from "./browser.js";
import { cacheKey, readCache, writeCache } from "./cache.js";
import { getEndpoint, listEndpoints, listStaticCandidates, loadCoverageMatrix, loadParameterValidation, loadStaticCatalog } from "./catalog.js";
import { captureNetwork } from "./capture.js";
import { attachExternalBrowser, executeExternalEndpoint, externalBrowserStatus } from "./external-browser.js";
import {
  ProfileCdpError,
  LoginRequiredError,
  checkProfileLogin,
  createProfile,
  listProfiles,
  loginProfile,
  profileBrowserStatus,
  requireProfileLogin,
  startProfile,
  stopProfile,
} from "./profiles.js";
import { COMMAND_DOMAINS, DOMAINS, type CommandDomain, type Domain } from "./types.js";

const program = new Command();
program.name("qianfan").description("小红书千帆只读 CLI").version("0.3.0-beta.1");

function json(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function parseJsonObject(value: string | undefined, label: string): Record<string, unknown> {
  if (!value) return {};
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return parsed as Record<string, unknown>;
}

interface RunOptions {
  query?: string;
  body?: string;
  browser?: "profile" | "external" | "managed";
  profile?: string;
  refresh?: boolean;
  cacheTtl?: number;
}

async function runCatalogEndpoint(id: string, options: RunOptions): Promise<void> {
  const endpoint = await getEndpoint(id);
  assertRunnableEndpoint(endpoint);
  const query = parseJsonObject(options.query, "query");
  const body = options.body ? parseJsonObject(options.body, "body") : undefined;
  if (endpoint.query?.length && !options.query) {
    throw new Error(`Endpoint ${id} needs --query. Observed example: ${JSON.stringify(endpoint.queryExample || {})}`);
  }
  if (endpoint.body?.length && !options.body) {
    throw new Error(`Endpoint ${id} needs --body. Observed example: ${JSON.stringify(endpoint.bodyExample || {})}`);
  }
  const input = { query, body };
  const browserMode = options.browser || "profile";
  if (!["profile", "external", "managed"].includes(browserMode)) {
    throw new Error(`Unknown browser mode: ${browserMode}. Use profile, external, or managed.`);
  }
  const profileName = options.profile || "default";
  const credentialScope = browserMode === "profile" ? `profile:${profileName}` : browserMode;
  const key = cacheKey(id, { ...input, credentialScope });
  if (!options.refresh) {
    const cached = await readCache<unknown>(key);
    if (cached) {
      json({ cached: true, cachedAt: cached.createdAt, value: cached.value });
      return;
    }
  }
  let result;
  if (browserMode === "profile") {
    const cdpSocket = await requireProfileLogin(profileName);
    result = await executeExternalEndpoint(endpoint, input, { cdpSocket });
  } else if (browserMode === "external") {
    result = await executeExternalEndpoint(endpoint, input);
  } else {
    const connected = await connectBrowser();
    try {
      const page = await qianfanPage(connected);
      result = await executeEndpoint(page, endpoint, input);
    } finally {
      await connected.close();
    }
  }
  const ttlSeconds = Math.max(0, Math.min(Number(options.cacheTtl ?? 600), 86_400));
  if (ttlSeconds > 0) await writeCache(key, result, ttlSeconds);
  json({ cached: false, value: result });
}

async function resolveDomainEndpoint(domain: CommandDomain, operation: string): Promise<string> {
  const direct = `${domain}.${operation}`;
  try {
    await getEndpoint(direct);
    return direct;
  } catch {
    const matches = (await listEndpoints(domain)).filter(
      (endpoint) => endpoint.id === operation || endpoint.id.endsWith(`.${operation}`),
    );
    if (matches.length === 1) return matches[0]!.id;
    if (matches.length > 1) {
      throw new Error(`Operation ${operation} is ambiguous in ${domain}: ${matches.map((endpoint) => endpoint.id).join(", ")}`);
    }
    throw new Error(`Unknown ${domain} operation: ${operation}. Run \`qianfan ${domain} ops\` to list operations.`);
  }
}

const browser = program.command("browser").description("管理本地私有千帆浏览器会话");
browser
  .command("start")
  .option("--port <number>", "CDP port", Number)
  .option("--url <url>", "initial URL")
  .action(async (options) => json(await startBrowser(options)));
browser.command("status").action(async () => json(await browserStatus()));
browser.command("stop").action(async () => json({ stopped: await stopBrowser() }));
browser.command("attach-external").description("通过 CDP 接管外部 Chrome").action(async () => json(await attachExternalBrowser()));
browser.command("external-status").action(async () => json(await externalBrowserStatus()));

const profile = program.command("profile").description("管理命名的专用 Chrome Profile；凭证由 Chrome 本地保存");
profile.command("create <name>").action(async (name) => json(await createProfile(name)));
profile.command("list").action(async () => json(await listProfiles()));
profile.command("start <name>").action(async (name) => {
  const state = await startProfile(name);
  json({
    profile: name,
    running: true,
    pid: state.pid,
    port: state.port,
    credentialStorage: "chrome-user-data-dir",
    cookiesRead: false,
    cookiesExported: false,
  });
});
profile
  .command("login <name>")
  .description("打开专用窗口，由用户本人完成登录；等待期间不刷新页面")
  .option("--wait <seconds>", "wait 0-900 seconds; login is checked every 10 seconds", Number, 300)
  .action(async (name, options) => {
    const result = await loginProfile(name, Number(options.wait));
    json(result);
    if (result.status !== "valid") process.exitCode = 3;
  });
profile.command("status <name>").action(async (name) => {
  const browserState = await profileBrowserStatus(name);
  const result = browserState.running ? await checkProfileLogin(name, 0) : {
    profile: name,
    status: "stopped" as const,
    running: false,
    httpStatus: null,
    businessCode: null,
    success: null,
    checkedAt: new Date().toISOString(),
    checks: 0,
    pollIntervalSeconds: 10,
    credentialStorage: "chrome-user-data-dir" as const,
    cookiesRead: false as const,
    cookiesExported: false as const,
  };
  json({ ...browserState, ...result });
  if (result.status !== "valid") process.exitCode = 3;
});
profile.command("stop <name>").action(async (name) => json(await stopProfile(name)));

const auth = program.command("auth").description("登录状态（不导出 Cookie 或 token）");
auth
  .command("login")
  .option("--profile <name>", "dedicated Profile name", "default")
  .option("--wait <seconds>", "wait 0-900 seconds", Number, 300)
  .action(async (options) => {
    const result = await loginProfile(options.profile, Number(options.wait));
    json(result);
    if (result.status !== "valid") process.exitCode = 3;
  });
auth
  .command("status")
  .option("--profile <name>", "dedicated Profile name", "default")
  .action(async (options) => {
    const result = await checkProfileLogin(options.profile, 0);
    json(result);
    if (result.status !== "valid") process.exitCode = 3;
  });

const api = program.command("api").description("查看或运行已经验证的接口目录");
api
  .command("list")
  .option("--domain <domain>")
  .action(async (options) => {
    const domain = options.domain as Domain | undefined;
    if (domain && !DOMAINS.includes(domain)) throw new Error(`Unknown domain: ${domain}`);
    json(await listEndpoints(domain));
  });
api.command("show <id>").action(async (id) => json(await getEndpoint(id)));
api
  .command("candidates")
  .description("列出当前前端版本中静态发现、尚不可调用的候选接口")
  .option("--domain <domain>")
  .action(async (options) => {
    const domain = options.domain as Domain | undefined;
    if (domain && !DOMAINS.includes(domain)) throw new Error(`Unknown domain: ${domain}`);
    json(await listStaticCandidates(domain));
  });
api.command("candidate-stats").action(async () => {
  const catalog = await loadStaticCatalog();
  json({ generatedAt: catalog.generatedAt, targetRevision: catalog.targetRevision, counts: catalog.counts });
});
api.command("candidate-show <path>").action(async (path) => {
  const matrix = await loadCoverageMatrix();
  const candidate = matrix.staticCandidates.find((entry) => entry.path === path);
  if (!candidate) throw new Error(`Unknown static candidate path: ${path}`);
  json(candidate);
});
api
  .command("call <id>")
  .option("--query <json>", "query object as JSON")
  .option("--body <json>", "body object as JSON")
  .option("--browser <mode>", "profile, external, or managed", "profile")
  .option("--profile <name>", "dedicated Profile used in profile mode", "default")
  .option("--refresh", "bypass the response cache", false)
  .option("--cache-ttl <seconds>", "cache time; default 600 seconds", Number, 600)
  .action(runCatalogEndpoint);

const coverage = program.command("coverage").description("查看全部候选、参数恢复与验证状态矩阵");
coverage.command("stats").action(async () => {
  const matrix = await loadCoverageMatrix();
  json({
    generatedAt: matrix.generatedAt,
    targetRevision: matrix.targetRevision,
    scope: matrix.scope,
    requestBudget: matrix.requestBudget,
    summary: matrix.summary,
  });
});
coverage
  .command("static")
  .option("--domain <domain>")
  .option("--state <state>")
  .action(async (options) => {
    const matrix = await loadCoverageMatrix();
    const domain = options.domain as Domain | undefined;
    if (domain && !DOMAINS.includes(domain)) throw new Error(`Unknown domain: ${domain}`);
    json(matrix.staticCandidates.filter((entry) => (!domain || entry.domain === domain) && (!options.state || entry.state === options.state)));
  });
coverage
  .command("observed")
  .option("--domain <domain>")
  .option("--state <state>")
  .action(async (options) => {
    const matrix = await loadCoverageMatrix();
    const domain = options.domain as Domain | undefined;
    if (domain && !DOMAINS.includes(domain)) throw new Error(`Unknown domain: ${domain}`);
    json(matrix.observedOperations.filter((entry) => (!domain || entry.domains.includes(domain)) && (!options.state || entry.state === options.state)));
  });
coverage.command("parameter-gaps").action(async () => {
  const matrix = await loadCoverageMatrix();
  json({
    observed: matrix.observedOperations.filter((entry) => entry.parameterCoverage === "OBSERVED_SINGLE_EXAMPLE"),
    static: matrix.staticCandidates.filter((entry) => entry.parameterCoverage === "SCHEMA_RECOVERED_UNVALIDATED"),
  });
});
coverage
  .command("parameters")
  .option("--all", "include every observed operation", false)
  .action(async (options) => {
    const report = await loadParameterValidation();
    json(options.all ? report : {
      generatedAt: report.generatedAt,
      scope: report.scope,
      policy: report.policy,
      summary: report.summary,
    });
  });

program
  .command("capture")
  .description("记录用户在浏览器中触发的低频 XHR/Fetch 元数据并自动脱敏")
  .requiredOption("--domain <domain>")
  .option("--seconds <number>", "capture duration", Number, 60)
  .option("--output <path>", "write JSON evidence")
  .action(async (options) => {
    const domain = options.domain as Domain;
    if (!DOMAINS.includes(domain)) throw new Error(`Unknown domain: ${domain}`);
    const seconds = Math.max(1, Math.min(Number(options.seconds), 600));
    const connected = await connectBrowser();
    try {
      const page = await qianfanPage(connected);
      const records = await captureNetwork(connected, page, { domain, durationMs: seconds * 1_000 });
      if (options.output) {
        const path = resolve(options.output);
        await writeFile(path, `${JSON.stringify(records, null, 2)}\n`, { mode: 0o600 });
        json({ output: path, count: records.length });
      } else {
        json(records);
      }
    } finally {
      await connected.close();
    }
  });

const DOMAIN_LABELS: Record<CommandDomain, string> = {
  overview: "总览",
  product: "商品",
  traffic: "流量",
  livestream: "直播",
  note: "笔记",
  trade: "交易",
  search: "搜索",
  marketplace: "市集",
  shop: "店铺",
  service: "服务",
  market: "市场",
  marketing: "营销",
};

for (const domain of COMMAND_DOMAINS) {
  const command = program.command(domain).alias(DOMAIN_LABELS[domain]).description(`${DOMAIN_LABELS[domain]}业务域`);
  command.command("ops").action(async () => json(await listEndpoints(domain)));
  command
    .command("run <operation>")
    .option("--query <json>")
    .option("--body <json>")
    .option("--browser <mode>", "profile, external, or managed", "profile")
    .option("--profile <name>", "dedicated Profile used in profile mode", "default")
    .option("--refresh", "bypass the response cache", false)
    .option("--cache-ttl <seconds>", "cache time; default 600 seconds", Number, 600)
    .action(async (operation, options) => runCatalogEndpoint(await resolveDomainEndpoint(domain, operation), options));
}

program.parseAsync().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`qianfan: ${message}\n`);
  process.exitCode = error instanceof LoginRequiredError ? 3 : error instanceof ProfileCdpError ? 2 : 1;
});
