import type { Page } from "playwright-core";
import type { ApiResult, EndpointSpec } from "./types.js";

const ALLOWED_HOST_SUFFIXES = ["xiaohongshu.com", "xhscdn.com"];

function assertAllowedHost(host: string): void {
  if (!ALLOWED_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`))) {
    throw new Error(`Endpoint host is outside the Qianfan allowlist: ${host}`);
  }
}

export function assertRunnableEndpoint(endpoint: EndpointSpec): void {
  if (!endpoint.runnable || endpoint.method === "UNKNOWN") {
    throw new Error(`Endpoint ${endpoint.id} is catalog-only and has not passed a runnable observation`);
  }
  if (endpoint.risk !== "read") {
    throw new Error(`Endpoint ${endpoint.id} is blocked because its risk is ${endpoint.risk}`);
  }
}

export function buildUrl(endpoint: EndpointSpec, query: Record<string, unknown>): string {
  assertAllowedHost(endpoint.host);
  const url = new URL(endpoint.path, `https://${endpoint.host}`);
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) value.forEach((item) => url.searchParams.append(key, String(item)));
    else url.searchParams.set(key, String(value));
  }
  return url.toString();
}

export async function executeEndpoint(
  page: Page,
  endpoint: EndpointSpec,
  input: { query?: Record<string, unknown>; body?: unknown },
): Promise<ApiResult> {
  assertRunnableEndpoint(endpoint);
  const url = buildUrl(endpoint, input.query ?? {});
  const result = await page.evaluate(
    async ({ requestUrl, method, body }) => {
      const init: RequestInit = {
        method,
        credentials: "include",
      };
      if (body !== undefined) {
        init.headers = { "content-type": "application/json" };
        init.body = JSON.stringify(body);
      }
      const response = await fetch(requestUrl, init);
      const contentType = response.headers.get("content-type") || "";
      const text = await response.text();
      let data: unknown = text;
      if (contentType.includes("json")) {
        try {
          data = JSON.parse(text);
        } catch {
          data = text;
        }
      }
      return { status: response.status, ok: response.ok, contentType, data };
    },
    { requestUrl: url, method: endpoint.method, body: input.body },
  );
  return { endpoint: endpoint.id, method: endpoint.method, url, ...result };
}
