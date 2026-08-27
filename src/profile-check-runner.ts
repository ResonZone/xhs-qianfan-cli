import { readFile } from "node:fs/promises";
import { chromium, type Page } from "playwright-core";
import { isValidSellerInfoProbe } from "./profile-login-state.js";

const QIANFAN_URL = "https://ark.xiaohongshu.com/ark";
const SELLER_INFO_PATH = "/api/edith/seller/info/v2";

interface CheckRequest {
  cdpSocket: string;
  waitSeconds: number;
  pollIntervalSeconds: number;
}

interface ProbeResult {
  status: "valid" | "login_required";
  httpStatus: number | null;
  businessCode: number | null;
  success: boolean | null;
}

function isQianfanHost(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === "ark.xiaohongshu.com" || host === "customer.xiaohongshu.com";
  } catch {
    return false;
  }
}

async function selectPage(pageCandidates: Page[]): Promise<Page | null> {
  return pageCandidates.find((page) => isQianfanHost(page.url())) || null;
}

async function probe(page: Page): Promise<ProbeResult> {
  let pageHost: string;
  try {
    pageHost = new URL(page.url()).hostname;
  } catch {
    return { status: "login_required", httpStatus: null, businessCode: null, success: null };
  }
  if (pageHost !== "ark.xiaohongshu.com") {
    return { status: "login_required", httpStatus: null, businessCode: null, success: null };
  }

  try {
    const result = await page.evaluate(async (path) => {
      const response = await fetch(path, { credentials: "include", redirect: "follow" });
      const finalHost = new URL(response.url).hostname;
      const text = await response.text();
      let payload: unknown = null;
      try { payload = JSON.parse(text); } catch { payload = null; }
      const record = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
      const rawCode = record.code;
      const code = typeof rawCode === "number" ? rawCode :
        typeof rawCode === "string" && rawCode.trim() !== "" && Number.isFinite(Number(rawCode)) ? Number(rawCode) : null;
      return {
        httpStatus: response.status,
        responseOk: response.ok,
        finalHost,
        businessCode: code,
        success: typeof record.success === "boolean" ? record.success : null,
      };
    }, SELLER_INFO_PATH);
    const valid = isValidSellerInfoProbe(result);
    return {
      status: valid ? "valid" : "login_required",
      httpStatus: result.httpStatus,
      businessCode: result.businessCode,
      success: result.success,
    };
  } catch {
    return { status: "login_required", httpStatus: null, businessCode: null, success: null };
  }
}

async function main(): Promise<void> {
  const requestPath = process.argv[2];
  if (!requestPath) throw new Error("Missing profile check request file");
  const request = JSON.parse(await readFile(requestPath, "utf8")) as CheckRequest;
  const browser = await chromium.connectOverCDP(request.cdpSocket);
  const context = browser.contexts()[0];
  if (!context) throw new Error("The dedicated Profile has no browser context");
  let page = await selectPage(context.pages());
  if (!page) {
    page = await context.newPage();
    await page.goto(QIANFAN_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
  }

  const deadline = Date.now() + request.waitSeconds * 1_000;
  let checks = 0;
  let result: ProbeResult = { status: "login_required", httpStatus: null, businessCode: null, success: null };
  do {
    checks += 1;
    result = await probe(page);
    if (result.status === "valid" || Date.now() >= deadline) break;
    await new Promise((resolve) => setTimeout(resolve, request.pollIntervalSeconds * 1_000));
  } while (Date.now() <= deadline);

  process.stdout.write(JSON.stringify({ ...result, checks }), () => process.exit(0));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  process.stderr.write(`${message}\n`, () => process.exit(2));
});
