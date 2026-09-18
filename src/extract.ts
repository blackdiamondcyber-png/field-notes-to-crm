import Anthropic from "@anthropic-ai/sdk";
import { readCache, writeCache } from "./lib/cache.js";
import { withRetry } from "./lib/concurrency.js";
import { SYSTEM_PROMPT as V1_PROMPT } from "./prompts/v1.js";
import { SYSTEM_PROMPT as V2_PROMPT } from "./prompts/v2.js";
import { ACTIVITY_TYPES, type ActivityRecord } from "./types.js";

export type PromptVersion = "v1" | "v2";

export const MODEL_ID = "claude-sonnet-5";

// $/1M tokens, from the claude-api skill's pricing table for claude-sonnet-5.
export const PRICE_PER_MILLION_INPUT = 2.0;
export const PRICE_PER_MILLION_OUTPUT = 10.0;

function promptFor(version: PromptVersion): string {
  return version === "v1" ? V1_PROMPT : V2_PROMPT;
}

const TOOL_NAME = "record_activity";

const TOOL_SCHEMA = {
  type: "object" as const,
  additionalProperties: false,
  required: [
    "office_name",
    "activity_type",
    "contacts",
    "products_mentioned",
    "outcome",
    "next_action",
    "next_action_date",
    "follow_up_needed",
    "confidence",
  ],
  properties: {
    office_name: { type: "string" },
    activity_type: { type: "string", enum: ACTIVITY_TYPES },
    contacts: { type: "array", items: { type: "string" } },
    products_mentioned: { type: "array", items: { type: "string" } },
    outcome: { type: "string" },
    next_action: { type: ["string", "null"] },
    next_action_date: { type: ["string", "null"] },
    follow_up_needed: { type: "boolean" },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
  },
};

let cachedClient: Anthropic | null = null;
function getClient(): Anthropic {
  cachedClient ??= new Anthropic();
  return cachedClient;
}

export interface ExtractResult {
  activity: ActivityRecord;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  cached: boolean;
}

function isActivityRecord(value: unknown): value is ActivityRecord {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.office_name === "string" &&
    typeof v.activity_type === "string" &&
    (ACTIVITY_TYPES as string[]).includes(v.activity_type) &&
    Array.isArray(v.contacts) &&
    Array.isArray(v.products_mentioned) &&
    typeof v.outcome === "string" &&
    (v.next_action === null || typeof v.next_action === "string") &&
    (v.next_action_date === null || typeof v.next_action_date === "string") &&
    typeof v.follow_up_needed === "boolean" &&
    (v.confidence === "high" ||
      v.confidence === "medium" ||
      v.confidence === "low")
  );
}

/**
 * Extracts a structured CRM activity record from one field note using the
 * given prompt version. Results are cached in .cache/ keyed by
 * sha256(promptVersion + note) so repeated eval runs are free.
 */
export async function extractActivity(
  note: string,
  notedAt: string,
  promptVersion: PromptVersion,
): Promise<ExtractResult> {
  const cached = readCache(promptVersion, note);
  if (cached) {
    return { ...cached, cached: true };
  }

  const client = getClient();
  const system = `${promptFor(promptVersion)}\n\nThe note's noted_at date is ${notedAt}.`;

  const start = performance.now();
  const response = await withRetry(() =>
    client.messages.create({
      model: MODEL_ID,
      max_tokens: 1024,
      system,
      thinking: { type: "disabled" },
      output_config: { effort: "low" },
      tools: [
        {
          name: TOOL_NAME,
          description:
            "Record one structured CRM activity extracted from a field note.",
          input_schema: TOOL_SCHEMA,
          strict: true,
        },
      ],
      tool_choice: { type: "tool", name: TOOL_NAME },
      messages: [{ role: "user", content: note }],
    }),
  );
  const latencyMs = performance.now() - start;

  const toolUse = response.content.find((block) => block.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error(
      `No tool_use block in response for note: ${note.slice(0, 60)}...`,
    );
  }
  if (!isActivityRecord(toolUse.input)) {
    throw new Error(
      `Tool input failed schema validation for note: ${note.slice(0, 60)}...`,
    );
  }

  const result: ExtractResult = {
    activity: toolUse.input,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    latencyMs,
    cached: false,
  };

  writeCache(promptVersion, note, {
    activity: result.activity,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    latencyMs: result.latencyMs,
  });

  return result;
}
