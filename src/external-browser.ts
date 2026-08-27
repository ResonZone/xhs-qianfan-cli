import { execFile } from "node:child_process";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { promisify } from "node:util";
import type { ApiResult, EndpointSpec } from "./types.js";
import { assertRunnableEndpoint, buildUrl } from "./api.js";

const execFileAsync = promisify(execFile);

function cliPath(): string {
  return process.env.QIANFAN_PLAYWRIGHT_CLI || "playwright-cli";
}

export function externalSessionName(): string {
  return process.env.QIANFAN_EXTERNAL_SESSION || "qianfan-external";
}

async function runCli(args: string[]): Promise<string> {
  const { stdout } = await execFileAsync(cliPath(), args, {
    maxBuffer: 100 * 1024 * 1024,
    timeout: 120_000,
  });
  return stdout.trim();
}

function sessionArgs(...args: string[]): string[] {
  return [`-s=${externalSessionName()}`, ...args];
}

function parseQianfanTab(raw: string): { index: number; url: string } | null {
  let parsed: { result?: string };
  try {
    parsed = JSON.parse(raw) as { result?: string };
  } catch {
    return null;
  }
  const result = parsed.result || "";
  const matches = [...result.matchAll(/^- (\d+):.*?\]\((https:\/\/ark\.xiaohongshu\.com[^)]*)\)/gm)];
  const match = matches.find((candidate) => candidate[0].includes("(current)")) || matches[0];
  if (!match?.[1] || !match[2]) return null;
  return { index: Number(match[1]), url: match[2] };
}

export async function selectExternalQianfanTab(): Promise<{ index: number; path: string }> {
  let raw = await runCli(sessionArgs("tab-list", "--json"));
  let tab = parseQianfanTab(raw);
  if (!tab) {
    await runCli(sessionArgs("tab-new", "https://ark.xiaohongshu.com/ark"));
    raw = await runCli(sessionArgs("tab-list", "--json"));
    tab = parseQianfanTab(raw);
  }
  if (!tab) throw new Error("External Chrome is connected, but no Qianfan tab could be selected");
  await runCli(sessionArgs("tab-select", String(tab.index)));
  return { index: tab.index, path: new URL(tab.url).pathname };
}

export async function attachExternalBrowser(): Promise<{ attached: true; session: string; qianfanPath: string }> {
  try {
    await runCli(sessionArgs("attach", "--cdp=chrome", "--json"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/already|exists|attached/i.test(message)) throw error;
  }
  const tab = await selectExternalQianfanTab();
  return { attached: true, session: externalSessionName(), qianfanPath: tab.path };
}

export async function externalBrowserStatus(): Promise<{
  attached: boolean;
  session: string;
  qianfanPath?: string;
}> {
  try {
    const tab = await selectExternalQianfanTab();
    return { attached: true, session: externalSessionName(), qianfanPath: tab.path };
  } catch {
    return { attached: false, session: externalSessionName() };
  }
}

export async function executeExternalEndpoint(
  endpoint: EndpointSpec,
  input: { query?: Record<string, unknown>; body?: unknown },
  options: { cdpSocket?: string } = {},
): Promise<ApiResult> {
  assertRunnableEndpoint(endpoint);
  const url = buildUrl(endpoint, input.query ?? {});
  const tempDir = await mkdtemp(join(tmpdir(), "qianfan-external-"));
  const requestPath = join(tempDir, "request.json");
  const request = { endpoint: endpoint.id, requestUrl: url, method: endpoint.method, body: input.body };
  try {
    await writeFile(requestPath, `${JSON.stringify(request)}\n`, { mode: 0o600 });
    await chmod(requestPath, 0o600);
    const runnerPath = fileURLToPath(new URL("./external-runner.js", import.meta.url));
    const environment = options.cdpSocket ? { ...process.env, QIANFAN_EXTERNAL_CDP: options.cdpSocket } : process.env;
    const { stdout } = await execFileAsync(process.execPath, [runnerPath, requestPath], {
      maxBuffer: 100 * 1024 * 1024,
      timeout: 120_000,
      env: environment,
    });
    return JSON.parse(stdout) as ApiResult;
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
