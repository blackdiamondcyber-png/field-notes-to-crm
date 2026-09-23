import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { pathToFileURL } from "node:url";
import { extractActivity, type PromptVersion } from "./extract.js";
import { mapWithConcurrency } from "./lib/concurrency.js";
import { checkGate } from "./lib/gate.js";
import { summarize, type EvalSummary, type UsageRow } from "./summarize.js";
import type { NoteRecord } from "./types.js";

const CONCURRENCY = 4;

export function loadDataset(): NoteRecord[] {
  const raw = readFileSync("data/notes.jsonl", "utf8");
  return raw
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as NoteRecord);
}

async function runEval(promptVersion: PromptVersion): Promise<EvalSummary> {
  const records = loadDataset();
  const failures: string[] = [];

  const outcomes = await mapWithConcurrency(
    records,
    CONCURRENCY,
    async (record) => {
      try {
        const result = await extractActivity(
          record.note,
          record.noted_at,
          promptVersion,
        );
        return { record, result };
      } catch (error) {
        failures.push(
          `${record.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
        return null;
      }
    },
  );

  const successes = outcomes.filter(
    (o): o is NonNullable<typeof o> => o !== null,
  );
  const rows: UsageRow[] = successes.map((o) => ({
    predicted: o.result.activity,
    label: o.record.label,
    inputTokens: o.result.inputTokens,
    outputTokens: o.result.outputTokens,
    latencyMs: o.result.latencyMs,
  }));

  return summarize(promptVersion, rows, failures);
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

export function summaryTable(summary: EvalSummary): string {
  const rows = [
    ["Activity type accuracy", pct(summary.activityTypeAccuracy)],
    ["next_action_date exact match", pct(summary.nextActionDateExactMatchRate)],
    [
      "next_action null-handling accuracy",
      pct(summary.nextActionNullHandlingAccuracy),
    ],
    ["products_mentioned F1", pct(summary.productsMentioned.f1)],
    ["contacts F1", pct(summary.contacts.f1)],
    ["office_name exact match", pct(summary.officeNameAccuracy)],
    ["Hallucination rate", pct(summary.hallucinationRate)],
    ["Mean latency", `${summary.meanLatencyMs.toFixed(0)} ms`],
    [
      "Total tokens (in/out)",
      `${summary.totalInputTokens} / ${summary.totalOutputTokens}`,
    ],
    ["Estimated cost", `$${summary.estimatedCostUsd.toFixed(4)}`],
  ];
  return rows.map(([label, value]) => `| ${label} | ${value} |`).join("\n");
}

function writeReport(current: EvalSummary, other: EvalSummary | null): void {
  mkdirSync("results", { recursive: true });

  let report = `# Eval report: ${current.promptVersion}\n\n`;
  report += `Records evaluated: ${current.recordCount} (failures: ${current.failures.length})\n\n`;
  report += `| Metric | ${current.promptVersion} |\n|---|---|\n${summaryTable(current)}\n\n`;

  report += `## Per-class activity_type metrics (${current.promptVersion})\n\n`;
  report += `| Type | Precision | Recall | F1 | Support |\n|---|---|---|---|---|\n`;
  for (const m of current.perClassActivityType) {
    report += `| ${m.activityType} | ${pct(m.precision)} | ${pct(m.recall)} | ${pct(m.f1)} | ${m.support} |\n`;
  }

  if (other) {
    const [v1, v2] =
      current.promptVersion === "v1" ? [current, other] : [other, current];
    report += `\n## Comparison: v1 vs v2\n\n`;
    report += `| Metric | v1 | v2 |\n|---|---|---|\n`;
    report += `| Activity type accuracy | ${pct(v1.activityTypeAccuracy)} | ${pct(v2.activityTypeAccuracy)} |\n`;
    report += `| next_action_date exact match | ${pct(v1.nextActionDateExactMatchRate)} | ${pct(v2.nextActionDateExactMatchRate)} |\n`;
    report += `| next_action null-handling accuracy | ${pct(v1.nextActionNullHandlingAccuracy)} | ${pct(v2.nextActionNullHandlingAccuracy)} |\n`;
    report += `| products_mentioned F1 | ${pct(v1.productsMentioned.f1)} | ${pct(v2.productsMentioned.f1)} |\n`;
    report += `| contacts F1 | ${pct(v1.contacts.f1)} | ${pct(v2.contacts.f1)} |\n`;
    report += `| office_name exact match | ${pct(v1.officeNameAccuracy)} | ${pct(v2.officeNameAccuracy)} |\n`;
    report += `| Hallucination rate | ${pct(v1.hallucinationRate)} | ${pct(v2.hallucinationRate)} |\n`;
    report += `| Estimated cost | $${v1.estimatedCostUsd.toFixed(4)} | $${v2.estimatedCostUsd.toFixed(4)} |\n`;
  }

  if (current.failures.length > 0) {
    report += `\n## Failures (${current.promptVersion})\n\n`;
    for (const f of current.failures) report += `- ${f}\n`;
  }

  writeFileSync("results/report.md", report, "utf8");
}

function runGate(current: EvalSummary): boolean {
  if (!existsSync("results/baseline.json")) {
    console.error(
      "No results/baseline.json found. Run --promote first to establish a baseline.",
    );
    return false;
  }
  const baseline = JSON.parse(
    readFileSync("results/baseline.json", "utf8"),
  ) as EvalSummary;
  const checks = checkGate(baseline, current);
  for (const c of checks) {
    const line = `${c.label} (baseline ${pct(c.baseline)} -> ${pct(c.current)})`;
    if (c.passed) console.log(`GATE OK: ${line}`);
    else console.error(`GATE FAIL: ${c.label} dropped ${pct(c.drop)}, ${line}`);
  }
  return checks.every((c) => c.passed);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const promptIndex = args.indexOf("--prompt");
  const promptArg = promptIndex >= 0 ? args[promptIndex + 1] : "v2";
  if (promptArg !== "v1" && promptArg !== "v2") {
    throw new Error("--prompt must be v1 or v2");
  }
  const promptVersion: PromptVersion = promptArg;
  const gate = args.includes("--gate");
  const promote = args.includes("--promote");

  const summary = await runEval(promptVersion);
  mkdirSync("results", { recursive: true });
  writeFileSync(
    `results/${promptVersion}.json`,
    JSON.stringify(summary, null, 2),
    "utf8",
  );

  const otherVersion: PromptVersion = promptVersion === "v1" ? "v2" : "v1";
  const otherPath = `results/${otherVersion}.json`;
  const other = existsSync(otherPath)
    ? (JSON.parse(readFileSync(otherPath, "utf8")) as EvalSummary)
    : null;
  writeReport(summary, other);

  console.log(
    `\nEval complete for ${promptVersion}. Wrote results/${promptVersion}.json and results/report.md`,
  );
  console.log(summaryTable(summary));

  if (promote) {
    copyFileSync(`results/${promptVersion}.json`, "results/baseline.json");
    console.log(
      `Promoted results/${promptVersion}.json to results/baseline.json`,
    );
  }

  if (gate) {
    const passed = runGate(summary);
    if (!passed) {
      process.exitCode = 1;
    }
  }
}

// Only run when eval.ts is the CLI entry point, not when score.ts imports
// loadDataset/summaryTable from this module.
const isCliEntry =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isCliEntry) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
