import { readFile } from "node:fs/promises";
import { chromium } from "playwright-core";

interface ExternalRequest {
  endpoint: string;
  requestUrl: string;
  method: string;
  body?: unknown;
}

async function main(): Promise<void> {
  const requestPath = process.argv[2];
  if (!requestPath) throw new Error("Missing external request file");
  const request = JSON.parse(await readFile(requestPath, "utf8")) as ExternalRequest;
  const browser = await chromium.connectOverCDP(process.env.QIANFAN_EXTERNAL_CDP || "ws://127.0.0.1:9222/devtools/browser");
  const context = browser.contexts()[0];
  if (!context) throw new Error("The external Chrome CDP connection has no browser context");
  let page = context.pages().find((candidate) => {
    try { return new URL(candidate.url()).hostname === "ark.xiaohongshu.com"; } catch { return false; }
  });
  if (!page) {
    page = await context.newPage();
    await page.goto("https://ark.xiaohongshu.com/ark", { waitUntil: "domcontentloaded", timeout: 30_000 });
  }
  const result = await page.evaluate(async (input) => {
    const init: RequestInit = { method: input.method, credentials: "include" };
    if (input.body !== undefined) {
      init.headers = { "content-type": "application/json" };
      init.body = JSON.stringify(input.body);
    }
    const response = await fetch(input.requestUrl, init);
    const contentType = response.headers.get("content-type") || "";
    const text = await response.text();
    let data: unknown = text;
    if (contentType.includes("json")) {
      try { data = JSON.parse(text); } catch { data = text; }
    }
    return { status: response.status, ok: response.ok, contentType, data };
  }, request);
  const output = JSON.stringify({ endpoint: request.endpoint, method: request.method, url: request.requestUrl, ...result });
  process.stdout.write(output, () => process.exit(0));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  process.stderr.write(`${message}\n`, () => process.exit(1));
});
