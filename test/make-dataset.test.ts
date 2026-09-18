import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function runMakeDataset(): void {
  execFileSync("npx", ["tsx", "scripts/make-dataset.ts"], {
    stdio: "pipe",
    shell: true,
  });
}

describe("make-dataset determinism", () => {
  it("produces byte-identical output across two runs with the same seed", () => {
    runMakeDataset();
    const first = readFileSync("data/notes.jsonl", "utf8");
    runMakeDataset();
    const second = readFileSync("data/notes.jsonl", "utf8");
    expect(second).toBe(first);
  }, 30000);

  it("produces exactly 150 records: 120 templated + 30 hand-written", () => {
    const raw = readFileSync("data/notes.jsonl", "utf8");
    const lines = raw.split("\n").filter((l) => l.trim() !== "");
    expect(lines.length).toBe(150);
    const records = lines.map((l) => JSON.parse(l) as { id: string });
    const templated = records.filter((r) => r.id.startsWith("tmpl-"));
    const hard = records.filter((r) => r.id.startsWith("hard-"));
    expect(templated.length).toBe(120);
    expect(hard.length).toBe(30);
  });
});
