import { createHash } from "node:crypto";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { configDir } from "./config.js";

interface CacheRecord<T> {
  createdAt: string;
  expiresAt: string;
  value: T;
}
function cacheDir(): string {
  return join(configDir(), "cache");
}

export function cacheKey(endpointId: string, input: unknown): string {
  return createHash("sha256").update(`${endpointId}\n${JSON.stringify(input)}`).digest("hex");
}

export async function readCache<T>(key: string): Promise<{ value: T; createdAt: string } | null> {
  try {
    const raw = await readFile(join(cacheDir(), `${key}.json`), "utf8");
    const record = JSON.parse(raw) as CacheRecord<T>;
    if (Date.parse(record.expiresAt) <= Date.now()) return null;
    return { value: record.value, createdAt: record.createdAt };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function writeCache<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
  await mkdir(cacheDir(), { recursive: true, mode: 0o700 });
  await chmod(cacheDir(), 0o700);
  const now = new Date();
  const record: CacheRecord<T> = {
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ttlSeconds * 1_000).toISOString(),
    value,
  };
  const path = join(cacheDir(), `${key}.json`);
  await writeFile(path, `${JSON.stringify(record)}\n`, { mode: 0o600 });
  await chmod(path, 0o600);
}
