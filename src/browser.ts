import { access } from "node:fs/promises";
import { spawn } from "node:child_process";
import { platform } from "node:os";
import { chromium, type Browser, type Page } from "playwright-core";
import { defaultPort, ensurePrivateDirectories, loadRuntime, profileDir, saveRuntime } from "./config.js";
import type { RuntimeState } from "./types.js";

const DEFAULT_URL = "https://ark.xiaohongshu.com/ark";

function browserCandidates(): string[] {
  const override = process.env.QIANFAN_BROWSER_EXECUTABLE;
  const candidates = override ? [override] : [];
  if (platform() === "darwin") {
    candidates.push(
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
    );
  } else if (platform() === "linux") {
    candidates.push("/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser");
  } else if (platform() === "win32") {
    const programFiles = process.env.PROGRAMFILES || "C:\\Program Files";
    candidates.push(`${programFiles}\\Google\\Chrome\\Application\\chrome.exe`);
  }
  return candidates;
}
export async function findBrowserExecutable(): Promise<string> {
  for (const candidate of browserCandidates()) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next known browser path.
    }
  }
  throw new Error("No supported Chrome/Edge/Chromium executable found; set QIANFAN_BROWSER_EXECUTABLE");
}

async function waitForCdp(port: number, timeoutMs = 15_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) return;
    } catch {
      // Browser is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Browser CDP endpoint did not start on port ${port}`);
}

export async function browserStatus(): Promise<{ running: boolean; state: RuntimeState | null }> {
  const state = await loadRuntime();
  if (!state) return { running: false, state: null };
  try {
    const response = await fetch(`http://127.0.0.1:${state.port}/json/version`);
    return { running: response.ok, state };
  } catch {
    return { running: false, state };
  }
}

export async function startBrowser(options: { port?: number; url?: string } = {}): Promise<RuntimeState> {
  const existing = await browserStatus();
  if (existing.running && existing.state) return existing.state;

  await ensurePrivateDirectories();
  const port = options.port ?? defaultPort();
  const executable = await findBrowserExecutable();
  const args = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir()}`,
    "--no-first-run",
    "--no-default-browser-check",
    options.url ?? DEFAULT_URL,
  ];
  const child = spawn(executable, args, { detached: true, stdio: "ignore" });
  child.unref();
  if (!child.pid) throw new Error("Browser process did not return a PID");

  const state: RuntimeState = {
    pid: child.pid,
    port,
    startedAt: new Date().toISOString(),
    executable,
    profileDir: profileDir(),
  };
  await waitForCdp(port);
  await saveRuntime(state);
  return state;
}

export async function stopBrowser(): Promise<boolean> {
  const status = await browserStatus();
  if (!status.state) return false;
  try {
    process.kill(status.state.pid, "SIGTERM");
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") return false;
    throw error;
  }
}

export async function connectBrowser(): Promise<Browser> {
  const status = await browserStatus();
  if (!status.running || !status.state) {
    throw new Error("Qianfan browser is not running; run `qianfan browser start` first");
  }
  return chromium.connectOverCDP(`http://127.0.0.1:${status.state.port}`);
}

export async function qianfanPage(browser: Browser): Promise<Page> {
  const context = browser.contexts()[0];
  if (!context) throw new Error("Browser has no default context");
  const pages = context.pages();
  let page = pages.find((candidate) => {
    try {
      return new URL(candidate.url()).hostname.endsWith("xiaohongshu.com");
    } catch {
      return false;
    }
  });
  if (!page) {
    page = await context.newPage();
    await page.goto(DEFAULT_URL, { waitUntil: "domcontentloaded" });
  }
  return page;
}
