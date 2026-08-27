import type { Browser, Page } from "playwright-core";
import { parseAndRedact, shapeOf } from "./redact.js";
import type { CapturedRequest, Domain } from "./types.js";

const ALLOWED_HOST_SUFFIXES = ["xiaohongshu.com", "xhscdn.com"];
const TELEMETRY_HOSTS = new Set([
  "apm-fe.xiaohongshu.com",
  "spider-tracker.xiaohongshu.com",
  "as.xiaohongshu.com",
]);

interface PendingRequest {
  record: CapturedRequest;
  responseRequestId?: string;
}

function allowedHost(host: string): boolean {
  return ALLOWED_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

function topFrame(initiator: any): CapturedRequest["initiator"] {
  const frame = initiator?.stack?.callFrames?.[0];
  if (!frame) return undefined;
  return { url: frame.url, lineNumber: frame.lineNumber, columnNumber: frame.columnNumber };
}

export async function captureNetwork(
  browser: Browser,
  page: Page,
  options: { domain: Domain; durationMs: number },
): Promise<CapturedRequest[]> {
  const context = browser.contexts()[0];
  if (!context) throw new Error("Browser has no default context");
  const session = await context.newCDPSession(page);
  const pending = new Map<string, PendingRequest>();
  const records: CapturedRequest[] = [];
  await session.send("Network.enable");

  session.on("Network.requestWillBeSent", (event: any) => {
    if (!['XHR', 'Fetch'].includes(event.type)) return;
    let url: URL;
    try {
      url = new URL(event.request.url);
    } catch {
      return;
    }
    if (!allowedHost(url.hostname)) return;
    if (TELEMETRY_HOSTS.has(url.hostname)) return;
    if (!url.pathname.startsWith("/api/") && !url.pathname.toLowerCase().includes("graphql")) return;
    const record: CapturedRequest = {
      capturedAt: new Date().toISOString(),
      domain: options.domain,
      method: event.request.method,
      host: url.hostname,
      path: url.pathname,
      queryKeys: [...url.searchParams.keys()].sort(),
      resourceType: event.type,
    };
    const initiator = topFrame(event.initiator);
    if (initiator) record.initiator = initiator;
    const requestBody = parseAndRedact(event.request.postData);
    if (requestBody !== undefined) record.requestBody = requestBody;
    pending.set(event.requestId, { record });
  });

  session.on("Network.responseReceived", (event: any) => {
    const item = pending.get(event.requestId);
    if (!item) return;
    item.record.status = event.response.status;
    item.record.mimeType = event.response.mimeType;
    item.responseRequestId = event.requestId;
  });

  session.on("Network.loadingFinished", async (event: any) => {
    const item = pending.get(event.requestId);
    if (!item) return;
    pending.delete(event.requestId);
    if (item.responseRequestId && item.record.mimeType?.includes("json")) {
      try {
        const body = await session.send("Network.getResponseBody", { requestId: item.responseRequestId });
        const parsed = JSON.parse(body.body);
        item.record.responseShape = shapeOf(parsed);
      } catch {
        // Metadata is still useful when a response body is unavailable.
      }
    }
    records.push(item.record);
  });

  await new Promise((resolve) => setTimeout(resolve, options.durationMs));
  await session.detach();
  records.push(...[...pending.values()].map((item) => item.record));
  return records;
}
