import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ActivityRecord } from "../types.js";

const CACHE_DIR = ".cache";

export interface CachedResult {
  activity: ActivityRecord;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
}

function cacheKey(promptVersion: string, note: string): string {
  return createHash("sha256").update(`${promptVersion}::${note}`).digest("hex");
}

function cachePath(key: string): string {
  return join(CACHE_DIR, `${key}.json`);
}

export function readCache(
  promptVersion: string,
  note: string,
): CachedResult | null {
  const key = cacheKey(promptVersion, note);
  const path = cachePath(key);
  if (!existsSync(path)) return null;
  try {
    const raw = readFileSync(path, "utf8");
    return JSON.parse(raw) as CachedResult;
  } catch {
    return null;
  }
}

export function writeCache(
  promptVersion: string,
  note: string,
  result: CachedResult,
): void {
  if (!existsSync(CACHE_DIR)) {
    mkdirSync(CACHE_DIR, { recursive: true });
  }
  const key = cacheKey(promptVersion, note);
  writeFileSync(cachePath(key), JSON.stringify(result), "utf8");
}
