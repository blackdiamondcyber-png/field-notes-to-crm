import { extractActivity, type PromptVersion } from "./extract.js";

function parseArgs(argv: string[]): {
  note: string;
  date: string;
  prompt: PromptVersion;
} {
  const positional: string[] = [];
  let date = new Date().toISOString().slice(0, 10);
  let prompt: PromptVersion = "v2";

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--date") {
      const value = argv[i + 1];
      if (value === undefined) throw new Error("--date requires a value");
      date = value;
      i += 1;
    } else if (arg === "--prompt") {
      const value = argv[i + 1];
      if (value !== "v1" && value !== "v2")
        throw new Error("--prompt must be v1 or v2");
      prompt = value;
      i += 1;
    } else if (arg !== undefined) {
      positional.push(arg);
    }
  }

  const note = positional.join(" ");
  if (note === "") {
    throw new Error(
      'Usage: pnpm extract "note text" [--date YYYY-MM-DD] [--prompt v1|v2]',
    );
  }
  return { note, date, prompt };
}

async function main(): Promise<void> {
  const { note, date, prompt } = parseArgs(process.argv.slice(2));
  const result = await extractActivity(note, date, prompt);
  console.log(JSON.stringify(result.activity, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
