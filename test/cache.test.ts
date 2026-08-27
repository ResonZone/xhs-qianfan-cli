import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { cacheKey, readCache, writeCache } from "../src/cache.js";

let testDir: string | undefined;

afterEach(async () => {
  if (testDir) await rm(testDir, { recursive: true, force: true });
  testDir = undefined;
  delete process.env.QIANFAN_CONFIG_DIR;
});
describe("low-frequency response cache", () => {
  it("returns an identical call from a private local cache", async () => {
    testDir = await mkdtemp(join(tmpdir(), "qianfan-cache-test-"));
    process.env.QIANFAN_CONFIG_DIR = testDir;
    const key = cacheKey("overview.test", { query: {}, body: undefined });
    await writeCache(key, { status: 200 }, 60);
    const cached = await readCache<{ status: number }>(key);
    expect(cached?.value.status).toBe(200);
    expect((await stat(join(testDir, "cache"))).mode & 0o777).toBe(0o700);
    expect((await stat(join(testDir, "cache", `${key}.json`))).mode & 0o777).toBe(0o600);
  });
});
