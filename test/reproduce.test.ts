import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { PromptVersion } from "../src/extract.js";
import {
  summarize,
  type EvalSummary,
  type UsageRow,
} from "../src/summarize.js";
import type { ActivityRecord, NoteRecord } from "../src/types.js";

interface PredictionLine {
  id: string;
  prompt_version: PromptVersion;
  predicted: ActivityRecord;
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

function loadPredictions(
  promptVersion: PromptVersion,
): Map<string, PredictionLine> {
  const raw = readFileSync(`data/predictions/${promptVersion}.jsonl`, "utf8");
  const byId = new Map<string, PredictionLine>();
  for (const line of raw.split("\n")) {
    if (line.trim() === "") continue;
    const parsed = JSON.parse(line) as PredictionLine;
    byId.set(parsed.id, parsed);
  }
  return byId;
}

function buildRows(
  records: readonly NoteRecord[],
  predictions: Map<string, PredictionLine>,
): UsageRow[] {
  return records.map((record) => {
    const prediction = predictions.get(record.id);
    if (!prediction) {
      throw new Error(`No prediction for ${record.id}`);
    }
    return {
      predicted: prediction.predicted,
      label: record.label,
      inputTokens: prediction.input_tokens,
      outputTokens: prediction.output_tokens,
      latencyMs: prediction.latency_ms,
    };
  });
}

describe.each<PromptVersion>(["v1", "v2"])(
  "summarize reproduces results/%s.json",
  (promptVersion) => {
    it("matches every field except failures, exactly", () => {
      const records = loadDataset();
      const predictions = loadPredictions(promptVersion);
      const rows = buildRows(records, predictions);

      const summary = summarize(promptVersion, rows, []);
      const expected = JSON.parse(
        readFileSync(`results/${promptVersion}.json`, "utf8"),
      ) as EvalSummary;

      expect(summary.failures).toStrictEqual([]);
      expect(expected.failures).toStrictEqual([]);

      // Compare every field except failures (already checked above) with
      // exact equality: toStrictEqual, not toBeCloseTo.
      expect({ ...summary, failures: [] }).toStrictEqual({
        ...expected,
        failures: [],
      });
    });
  },
);
