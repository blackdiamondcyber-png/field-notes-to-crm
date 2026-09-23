import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { loadDataset, summaryTable } from "./eval.js";
import type { PromptVersion } from "./extract.js";
import { summarize, type EvalSummary, type UsageRow } from "./summarize.js";
import type { ActivityRecord } from "./types.js";

interface PredictionLine {
  id: string;
  prompt_version: PromptVersion;
  predicted: ActivityRecord;
  input_tokens: number;
  output_tokens: number;
  latency_ms: number;
}

function loadPredictions(
  promptVersion: PromptVersion,
): Map<string, PredictionLine> {
  const path = `data/predictions/${promptVersion}.jsonl`;
  const raw = readFileSync(path, "utf8");
  const byId = new Map<string, PredictionLine>();
  for (const line of raw.split("\n")) {
    if (line.trim() === "") continue;
    const parsed = JSON.parse(line) as PredictionLine;
    byId.set(parsed.id, parsed);
  }
  return byId;
}

function diffFields(actual: EvalSummary, expected: EvalSummary): string[] {
  const diffs: string[] = [];
  for (const key of Object.keys(expected) as Array<keyof EvalSummary>) {
    if (!isDeepStrictEqual(actual[key], expected[key])) {
      diffs.push(
        `${key}: expected ${JSON.stringify(expected[key])}, got ${JSON.stringify(actual[key])}`,
      );
    }
  }
  return diffs;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const promptIndex = args.indexOf("--prompt");
  const promptArg = promptIndex >= 0 ? args[promptIndex + 1] : undefined;
  if (promptArg !== "v1" && promptArg !== "v2") {
    throw new Error("--prompt must be v1 or v2");
  }
  const promptVersion: PromptVersion = promptArg;
  const check = args.includes("--check");

  const records = loadDataset();
  const predictions = loadPredictions(promptVersion);
  const rows: UsageRow[] = records.map((record) => {
    const prediction = predictions.get(record.id);
    if (!prediction) {
      throw new Error(
        `No prediction for ${record.id} in data/predictions/${promptVersion}.jsonl`,
      );
    }
    return {
      predicted: prediction.predicted,
      label: record.label,
      inputTokens: prediction.input_tokens,
      outputTokens: prediction.output_tokens,
      latencyMs: prediction.latency_ms,
    };
  });

  const summary = summarize(promptVersion, rows, []);

  console.log(
    `Scored ${promptVersion} from data/predictions/${promptVersion}.jsonl (no API calls)`,
  );
  console.log(summaryTable(summary));

  if (check) {
    const resultsPath = `results/${promptVersion}.json`;
    const expected = JSON.parse(
      readFileSync(resultsPath, "utf8"),
    ) as EvalSummary;
    const diffs = diffFields(summary, expected);
    if (diffs.length > 0) {
      console.error(`\nMISMATCH vs ${resultsPath}:`);
      for (const diff of diffs) console.error(`  ${diff}`);
      process.exitCode = 1;
      return;
    }
    console.log(`\nMatches ${resultsPath} exactly.`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
