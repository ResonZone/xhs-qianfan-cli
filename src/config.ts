import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { RuntimeState } from "./types.js";

const DEFAULT_CONFIG_DIR = join(homedir(), ".config", "xhs-qianfan-cli");

export function configDir(): string {
  return process.env.QIANFAN_CONFIG_DIR || DEFAULT_CONFIG_DIR;
}
export function profileDir(): string {
  return process.env.QIANFAN_PROFILE_DIR || join(configDir(), "browser-profile");
}

export function runtimeFile(): string {
  return join(configDir(), "runtime.json");
}

export function defaultPort(): number {
  const value = Number(process.env.QIANFAN_CDP_PORT || "9333");
  if (!Number.isInteger(value) || value < 1024 || value > 65535) {
    throw new Error("QIANFAN_CDP_PORT must be an integer between 1024 and 65535");
  }
  return value;
}

export async function ensurePrivateDirectories(): Promise<void> {
  await mkdir(configDir(), { recursive: true, mode: 0o700 });
  await chmod(configDir(), 0o700);
  await mkdir(profileDir(), { recursive: true, mode: 0o700 });
  await chmod(profileDir(), 0o700);
}

export async function saveRuntime(state: RuntimeState): Promise<void> {
  await ensurePrivateDirectories();
  await writeFile(runtimeFile(), `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  await chmod(runtimeFile(), 0o600);
}

export async function loadRuntime(): Promise<RuntimeState | null> {
  try {
    const raw = await readFile(runtimeFile(), "utf8");
    return JSON.parse(raw) as RuntimeState;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}
