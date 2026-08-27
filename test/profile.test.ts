import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createProfile,
  listProfiles,
  parseDevToolsActivePort,
  profilePaths,
  profilesDir,
  validateProfileName,
} from "../src/profiles.js";
import { isValidSellerInfoProbe } from "../src/profile-login-state.js";

let testDir: string | undefined;

afterEach(async () => {
  if (testDir) await rm(testDir, { recursive: true, force: true });
  testDir = undefined;
  delete process.env.QIANFAN_CONFIG_DIR;
});

describe("dedicated Qianfan Profiles", () => {
  it("creates private metadata and a separate Chrome user-data directory", async () => {
    testDir = await mkdtemp(join(tmpdir(), "qianfan-profile-test-"));
    process.env.QIANFAN_CONFIG_DIR = testDir;
    const metadata = await createProfile("shop-a");
    const paths = profilePaths("shop-a");

    expect(metadata).toMatchObject({
      name: "shop-a",
      credentialStorage: "chrome-user-data-dir",
      cookieExported: false,
    });
    expect(metadata.chromeUserDataDir).toBe(paths.chromeUserDataDir);
    expect((await stat(paths.root)).mode & 0o777).toBe(0o700);
    expect((await stat(paths.chromeUserDataDir)).mode & 0o777).toBe(0o700);
    expect((await stat(paths.metadataFile)).mode & 0o777).toBe(0o600);
    const raw = await readFile(paths.metadataFile, "utf8");
    expect(raw).not.toMatch(/token|password|authorization|cookieValue|storageState/i);
    expect(await listProfiles()).toMatchObject([{ name: "shop-a", running: false }]);
  });

  it("rejects traversal and ambiguous Profile names", () => {
    for (const name of ["../default", "shop/a", "two shops", "", ".hidden"]) {
      expect(() => validateProfileName(name)).toThrow("Profile name");
    }
    expect(validateProfileName("shop_A.2026-08")).toBe("shop_A.2026-08");
  });

  it("rejects cloud-sync storage roots", () => {
    process.env.QIANFAN_CONFIG_DIR = "/Users/test/Library/CloudStorage/Provider/qianfan";
    expect(() => profilesDir()).toThrow("local disk");
  });

  it("accepts only loopback browser DevToolsActivePort records", () => {
    expect(parseDevToolsActivePort("49152\n/devtools/browser/abc-123\n")).toEqual({
      port: 49152,
      browserPath: "/devtools/browser/abc-123",
    });
    expect(() => parseDevToolsActivePort("9222\n/http://example.com\n")).toThrow("browser path");
    expect(() => parseDevToolsActivePort("70000\n/devtools/browser/test\n")).toThrow("invalid port");
  });

  it("requires HTTP success, Qianfan origin, code zero, and non-false business success", () => {
    const valid = {
      httpStatus: 200,
      responseOk: true,
      finalHost: "ark.xiaohongshu.com",
      businessCode: 0,
      success: true,
    };
    expect(isValidSellerInfoProbe(valid)).toBe(true);
    expect(isValidSellerInfoProbe({ ...valid, httpStatus: 401, responseOk: false })).toBe(false);
    expect(isValidSellerInfoProbe({ ...valid, finalHost: "customer.xiaohongshu.com" })).toBe(false);
    expect(isValidSellerInfoProbe({ ...valid, businessCode: -1 })).toBe(false);
    expect(isValidSellerInfoProbe({ ...valid, success: false })).toBe(false);
  });
});
