import { describe, expect, it } from "vitest";
import { assertRunnableEndpoint, buildUrl } from "../src/api.js";
import { listEndpoints, listStaticCandidates } from "../src/catalog.js";
import type { EndpointSpec } from "../src/types.js";

const endpoint: EndpointSpec = {
  id: "product.list",
  domain: "product",
  title: "test",
  method: "GET",
  host: "ark.xiaohongshu.com",
  path: "/api/test",
  risk: "read",
  evidence: "observed",
  runnable: true,
  source: "test",
};

describe("buildUrl", () => {
  it("encodes query values", () => {
    expect(buildUrl(endpoint, { page: 1, keyword: "八珍糕" })).toBe(
      "https://ark.xiaohongshu.com/api/test?page=1&keyword=%E5%85%AB%E7%8F%8D%E7%B3%95",
    );
  });

  it("rejects unrelated hosts", () => {
    expect(() => buildUrl({ ...endpoint, host: "example.com" }, {})).toThrow("outside the Qianfan allowlist");
  });

  it("blocks non-runnable endpoints before any browser connection", () => {
    expect(() => assertRunnableEndpoint({ ...endpoint, runnable: false, risk: "write" })).toThrow("catalog-only");
    expect(() => assertRunnableEndpoint({ ...endpoint, runnable: true, risk: "write" })).toThrow("risk is write");
  });
});

describe("catalog", () => {
  it("keeps static candidates non-runnable", async () => {
    const candidates = await listStaticCandidates("product");
    expect(candidates.length).toBeGreaterThan(100);
    expect(candidates.every((candidate) => candidate.evidence === "static" && !candidate.runnable)).toBe(true);
  });

  it("contains an observed login-status endpoint", async () => {
    const endpoints = await listEndpoints("common");
    expect(endpoints.some((endpoint) => endpoint.id === "common.seller-info-v2" && endpoint.runnable)).toBe(true);
  });

  it("loads the authenticated current-operation catalog", async () => {
    const endpoints = await listEndpoints();
    expect(endpoints).toHaveLength(138);
    expect(endpoints.every((endpoint) => endpoint.evidence === "observed")).toBe(true);
    expect(endpoints.filter((endpoint) => endpoint.runnable && endpoint.risk === "read")).toHaveLength(137);
    expect(endpoints.filter((endpoint) => endpoint.operation)).toHaveLength(87);
    expect(endpoints.find((endpoint) => endpoint.id === "product.long-task-task-submit")).toMatchObject({ risk: "write", runnable: false });
  });

  it("lists endpoints reused by the product domain", async () => {
    const endpoints = await listEndpoints("product");
    expect(endpoints).toHaveLength(8);
    expect(endpoints.some((endpoint) => endpoint.id === "product.goods-overall-seller-nitem-rank-list-v3")).toBe(true);
  });
});
