import { execFile, spawn } from "node:child_process";
import { access, chmod, mkdir, mkdtemp, readFile, readdir, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { platform } from "node:os";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { findBrowserExecutable } from "./browser.js";
import { configDir } from "./config.js";
import type { NamedProfileMetadata, NamedProfileRuntime, ProfileLoginResult } from "./types.js";

const execFileAsync = promisify(execFile);
const QIANFAN_URL = "https://ark.xiaohongshu.com/ark";
const LOGIN_POLL_INTERVAL_SECONDS = 10;

export class ProfileCdpError extends Error {}
export class LoginRequiredError extends Error {}

export interface ProfilePaths {
  root: string;
  chromeUserDataDir: string;
  metadataFile: string;
  runtimeFile: string;
  devToolsActivePortFile: string;
}

export function validateProfileName(name: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(name)) {
    throw new Error("Profile name must be 1-64 characters using letters, digits, dot, underscore, or hyphen");
  }
  return name;
}

function assertLocalPrivatePath(path: string): void {
  const normalized = resolve(path).toLowerCase().replaceAll("\\", "/");
  const forbidden = [
    "/library/cloudstorage/",
    "/library/mobile documents/",
    "/onedrive/",
    "/dropbox/",
    "/icloud drive/",
  ];
  if (forbidden.some((segment) => normalized.includes(segment))) {
    throw new Error("Dedicated Qianfan Profiles must stay on local disk, outside cloud-sync folders");
  }
}

export function profilesDir(): string {
  const value = join(configDir(), "profiles");
  assertLocalPrivatePath(value);
  return value;
}

export function profilePaths(name: string): ProfilePaths {
  const safeName = validateProfileName(name);
  const root = join(profilesDir(), safeName);
  const chromeUserDataDir = join(root, "chrome-user-data");
  assertLocalPrivatePath(chromeUserDataDir);
  return {
    root,
    chromeUserDataDir,
    metadataFile: join(root, "profile.json"),
    runtimeFile: join(root, "runtime.json"),
    devToolsActivePortFile: join(chromeUserDataDir, "DevToolsActivePort"),
  };
}

async function writePrivateJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await chmod(path, 0o600);
}

async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function createProfile(name: string): Promise<NamedProfileMetadata> {
  const paths = profilePaths(name);
  await mkdir(configDir(), { recursive: true, mode: 0o700 });
  await chmod(configDir(), 0o700);
  await mkdir(profilesDir(), { recursive: true, mode: 0o700 });
  await chmod(profilesDir(), 0o700);
  await mkdir(paths.root, { recursive: true, mode: 0o700 });
  await chmod(paths.root, 0o700);
  await mkdir(paths.chromeUserDataDir, { recursive: true, mode: 0o700 });
  await chmod(paths.chromeUserDataDir, 0o700);

  const existing = await readJson<NamedProfileMetadata>(paths.metadataFile);
  if (existing) return existing;
  const metadata: NamedProfileMetadata = {
    version: 1,
    name: validateProfileName(name),
    createdAt: new Date().toISOString(),
    profileRoot: paths.root,
    chromeUserDataDir: paths.chromeUserDataDir,
    credentialStorage: "chrome-user-data-dir",
    cookieExported: false,
  };
  await writePrivateJson(paths.metadataFile, metadata);
  return metadata;
}

export function parseDevToolsActivePort(raw: string): { port: number; browserPath: string } {
  const [portLine, pathLine] = raw.trim().split(/\r?\n/);
  const port = Number(portLine);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new ProfileCdpError("DevToolsActivePort contains an invalid port");
  }
  if (!pathLine?.startsWith("/devtools/browser/")) {
    throw new ProfileCdpError("DevToolsActivePort contains an invalid browser path");
  }
  return { port, browserPath: pathLine };
}

async function readCdp(name: string): Promise<{ port: number; cdpSocket: string } | null> {
  const paths = profilePaths(name);
  try {
    const parsed = parseDevToolsActivePort(await readFile(paths.devToolsActivePortFile, "utf8"));
    return { port: parsed.port, cdpSocket: `ws://127.0.0.1:${parsed.port}${parsed.browserPath}` };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    if (error instanceof ProfileCdpError) return null;
    throw error;
  }
}

async function probeCdp(cdp: { port: number; cdpSocket: string } | null): Promise<boolean> {
  if (!cdp) return false;
  try {
    const response = await fetch(`http://127.0.0.1:${cdp.port}/json/version`, { signal: AbortSignal.timeout(2_000) });
    if (!response.ok) return false;
    const payload = await response.json() as { webSocketDebuggerUrl?: string };
    if (!payload.webSocketDebuggerUrl) return false;
    const announced = new URL(payload.webSocketDebuggerUrl);
    const expected = new URL(cdp.cdpSocket);
    return ["127.0.0.1", "localhost", "::1"].includes(announced.hostname) &&
      announced.port === String(cdp.port) &&
      announced.pathname === expected.pathname;
  } catch {
    return false;
  }
}

async function loadRuntime(name: string): Promise<NamedProfileRuntime | null> {
  return readJson<NamedProfileRuntime>(profilePaths(name).runtimeFile);
}

export async function profileBrowserStatus(name: string): Promise<{
  profile: string;
  exists: boolean;
  running: boolean;
  port: number | null;
  pid: number | null;
  credentialStorage: "chrome-user-data-dir";
  cookiesRead: false;
  cookiesExported: false;
}> {
  const paths = profilePaths(name);
  let exists = true;
  try { await access(paths.metadataFile); } catch { exists = false; }
  if (!exists) {
    return { profile: name, exists: false, running: false, port: null, pid: null, credentialStorage: "chrome-user-data-dir", cookiesRead: false, cookiesExported: false };
  }
  const [cdp, runtime] = await Promise.all([readCdp(name), loadRuntime(name)]);
  const running = await probeCdp(cdp);
  return {
    profile: name,
    exists: true,
    running,
    port: running && cdp ? cdp.port : null,
    pid: running && runtime ? runtime.pid : null,
    credentialStorage: "chrome-user-data-dir",
    cookiesRead: false,
    cookiesExported: false,
  };
}

export async function startProfile(name: string, url = QIANFAN_URL): Promise<NamedProfileRuntime> {
  const metadata = await createProfile(name);
  const existingStatus = await profileBrowserStatus(name);
  const existingRuntime = await loadRuntime(name);
  if (existingStatus.running && existingStatus.port && existingRuntime) return existingRuntime;

  const executable = await findBrowserExecutable();
  const args = [
    "--remote-debugging-address=127.0.0.1",
    "--remote-debugging-port=0",
    `--user-data-dir=${metadata.chromeUserDataDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    url,
  ];
  const child = spawn(executable, args, { detached: true, stdio: "ignore" });
  child.unref();
  if (!child.pid) throw new ProfileCdpError("Dedicated Profile browser did not return a PID");

  const deadline = Date.now() + 30_000;
  let cdp: { port: number; cdpSocket: string } | null = null;
  while (Date.now() < deadline) {
    cdp = await readCdp(name);
    if (await probeCdp(cdp)) break;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  }
  if (!cdp || !(await probeCdp(cdp))) {
    throw new ProfileCdpError(`Dedicated Profile ${name} did not expose a loopback CDP endpoint`);
  }
  const runtime: NamedProfileRuntime = {
    pid: child.pid,
    port: cdp.port,
    startedAt: new Date().toISOString(),
    executable,
    profileName: name,
  };
  await writePrivateJson(profilePaths(name).runtimeFile, runtime);
  return runtime;
}

export async function profileCdpSocket(name: string): Promise<string> {
  const cdp = await readCdp(name);
  if (!cdp || !(await probeCdp(cdp))) {
    throw new ProfileCdpError(`Dedicated Profile ${name} is not running`);
  }
  return cdp.cdpSocket;
}

interface RawLoginProbe {
  status: "valid" | "login_required";
  httpStatus: number | null;
  businessCode: number | null;
  success: boolean | null;
  checks: number;
}

export async function checkProfileLogin(name: string, waitSeconds = 0): Promise<ProfileLoginResult> {
  validateProfileName(name);
  if (!Number.isInteger(waitSeconds) || waitSeconds < 0 || waitSeconds > 900) {
    throw new Error("Login wait must be an integer between 0 and 900 seconds");
  }
  const status = await profileBrowserStatus(name);
  if (!status.running) {
    return {
      profile: name,
      status: "stopped",
      running: false,
      httpStatus: null,
      businessCode: null,
      success: null,
      checkedAt: new Date().toISOString(),
      checks: 0,
      pollIntervalSeconds: LOGIN_POLL_INTERVAL_SECONDS,
      credentialStorage: "chrome-user-data-dir",
      cookiesRead: false,
      cookiesExported: false,
    };
  }
  const tempDir = await mkdtemp(join(tmpdir(), "qianfan-profile-check-"));
  const requestPath = join(tempDir, "request.json");
  try {
    await writePrivateJson(requestPath, {
      cdpSocket: await profileCdpSocket(name),
      waitSeconds,
      pollIntervalSeconds: LOGIN_POLL_INTERVAL_SECONDS,
    });
    const runnerPath = fileURLToPath(new URL("./profile-check-runner.js", import.meta.url));
    let stdout: string;
    try {
      ({ stdout } = await execFileAsync(process.execPath, [runnerPath, requestPath], {
        maxBuffer: 10 * 1024 * 1024,
        timeout: Math.max(120_000, (waitSeconds + 45) * 1_000),
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new ProfileCdpError(`Dedicated Profile CDP login check failed: ${message}`);
    }
    const result = JSON.parse(stdout) as RawLoginProbe;
    return {
      profile: name,
      status: result.status,
      running: true,
      httpStatus: result.httpStatus,
      businessCode: result.businessCode,
      success: result.success,
      checkedAt: new Date().toISOString(),
      checks: result.checks,
      pollIntervalSeconds: LOGIN_POLL_INTERVAL_SECONDS,
      credentialStorage: "chrome-user-data-dir",
      cookiesRead: false,
      cookiesExported: false,
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

export async function loginProfile(name: string, waitSeconds = 300): Promise<ProfileLoginResult> {
  await startProfile(name, QIANFAN_URL);
  return checkProfileLogin(name, waitSeconds);
}

export async function requireProfileLogin(name: string): Promise<string> {
  await startProfile(name, QIANFAN_URL);
  const result = await checkProfileLogin(name, 0);
  if (result.status !== "valid") {
    throw new LoginRequiredError(`QIANFAN_LOGIN_REQUIRED: run \`qianfan profile login ${name}\` and complete login in the dedicated window`);
  }
  return profileCdpSocket(name);
}

export async function stopProfile(name: string): Promise<{ profile: string; stopped: boolean; profilePreserved: true }> {
  const runtime = await loadRuntime(name);
  let stopped = false;
  const cdp = await readCdp(name);
  if (await probeCdp(cdp)) {
    const tempDir = await mkdtemp(join(tmpdir(), "qianfan-profile-close-"));
    const requestPath = join(tempDir, "request.json");
    try {
      await writePrivateJson(requestPath, { cdpSocket: cdp!.cdpSocket });
      const runnerPath = fileURLToPath(new URL("./profile-close-runner.js", import.meta.url));
      await execFileAsync(process.execPath, [runnerPath, requestPath], { timeout: 30_000, maxBuffer: 1024 * 1024 });
      const deadline = Date.now() + 5_000;
      while (Date.now() < deadline && await probeCdp(cdp)) {
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
      }
      stopped = !(await probeCdp(cdp));
    } catch {
      // Fall back to the owned process below.
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }
  if (!stopped && runtime) {
    try {
      process.kill(platform() === "win32" ? runtime.pid : -runtime.pid, "SIGTERM");
      const deadline = Date.now() + 5_000;
      while (Date.now() < deadline && await probeCdp(cdp)) {
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
      }
      stopped = !(await probeCdp(cdp));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
    }
  }
  try { await unlink(profilePaths(name).runtimeFile); } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return { profile: name, stopped, profilePreserved: true };
}

export async function listProfiles(): Promise<Array<{
  name: string;
  createdAt: string;
  running: boolean;
  port: number | null;
  profileRoot: string;
  credentialStorage: "chrome-user-data-dir";
  cookiesExported: false;
}>> {
  let entries;
  try { entries = await readdir(profilesDir(), { withFileTypes: true }); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const results = await Promise.all(entries.filter((entry) => entry.isDirectory()).map(async (entry) => {
    const name = basename(entry.name);
    try {
      const metadata = await readJson<NamedProfileMetadata>(profilePaths(name).metadataFile);
      if (!metadata) return null;
      const status = await profileBrowserStatus(name);
      return {
        name: metadata.name,
        createdAt: metadata.createdAt,
        running: status.running,
        port: status.port,
        profileRoot: metadata.profileRoot,
        credentialStorage: metadata.credentialStorage,
        cookiesExported: false as const,
      };
    } catch {
      return null;
    }
  }));
  return results.filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .sort((left, right) => left.name.localeCompare(right.name));
}
