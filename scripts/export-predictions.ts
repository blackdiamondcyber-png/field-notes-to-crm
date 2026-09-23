import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cacheKey, type CachedResult } from "../src/lib/cache.js";
import type { NoteRecord } from "../src/types.js";

type PromptVersion = "v1" | "v2";

const VERSIONS: PromptVersion[] = ["v1", "v2"];
const CACHE_DIR = ".cache";
const OUTPUT_DIR = "data/predictions";

interface PredictionLine {
  id: string;
  prompt_version: PromptVersion;
  predicted: CachedResult["activity"];
  input_tokens: number;
  output_tokens: number;
  latency_ms: number;
}

function loadDataset(): NoteRecord[] {
  const raw = readFileSync("data/notes.jsonl", "utf8");
  return raw
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as NoteRecord);
}

function exportVersion(
  version: PromptVersion,
  records: readonly NoteRecord[],
): void {
  const lines: string[] = [];
  for (const record of records) {
    const key = cacheKey(version, record.note);
    const path = join(CACHE_DIR, `${key}.json`);
    if (!existsSync(path)) {
      throw new Error(
        `Missing cache entry for ${record.id} (${version}): expected ${path}. Run the eval for ${version} first.`,
      );
    }
    const cached = JSON.parse(readFileSync(path, "utf8")) as CachedResult;
    const line: PredictionLine = {
      id: record.id,
      prompt_version: version,
      predicted: cached.activity,
      input_tokens: cached.inputTokens,
      output_tokens: cached.outputTokens,
      latency_ms: cached.latencyMs,
    };
    lines.push(JSON.stringify(line));
  }
  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(
    join(OUTPUT_DIR, `${version}.jsonl`),
    `${lines.join("\n")}\n`,
    "utf8",
  );
}

function main(): void {
  const records = loadDataset();
  for (const version of VERSIONS) {
    exportVersion(version, records);
    console.log(
      `Wrote ${join(OUTPUT_DIR, `${version}.jsonl`)} (${records.length} records)`,
    );
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
