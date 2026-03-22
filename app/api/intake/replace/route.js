import { getEnv } from "@/lib/getEnv";
import Anthropic from "@anthropic-ai/sdk";
import { jsonrepair } from "jsonrepair";
const db = require("@/lib/db");

const INTAKE_SYSTEM_PROMPT = `You are a data intake assistant. Your job is to process raw text that a user has dumped into a knowledge system.

For each input, you must:
1. Decide which module the content belongs to. The only valid options are: people, projects, notes, or external.
2. Extract a list of relevant tags (keywords or categories that describe the content).
3. Create a clean, formatted version of the input as structured_data.

You must respond with ONLY a valid JSON object, no other text. The JSON must have exactly these fields:
- module: one of "people", "projects", "notes", "external"
- tags: an array of strings
- entity_links: an empty array []
- source: "user_dump"
- structured_data: a clean formatted version of the input (string or object). CRITICAL: Escape all quotes and newlines in strings. Use \\" for quotes inside strings, \\n for newlines. Prefer an object like {"content": "..."} for long text to avoid escaping issues.`;

export async function POST(request) {
  try {
    const apiKey = getEnv("ANTHROPIC_API_KEY");
    if (!apiKey?.trim()) {
      return Response.json(
        {
          error:
            "ANTHROPIC_API_KEY is missing. Add it to .env.local and restart the dev server.",
        },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { id, rawText } = body ?? {};

    if (!id || typeof id !== "string") {
      return Response.json({ error: "id is required" }, { status: 400 });
    }
    if (!rawText || typeof rawText !== "string") {
      return Response.json({ error: "rawText is required" }, { status: 400 });
    }

    const anthropic = new Anthropic({ apiKey });
    const message = await anthropic.messages.create({
      max_tokens: 1024,
      system: INTAKE_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Process this raw text and return the required JSON:\n\n${rawText}`,
        },
      ],
      model: "claude-haiku-4-5-20251001",
    });

    const textContent = message.content.find((block) => block.type === "text");
    if (!textContent || textContent.type !== "text") {
      throw new Error("Claude did not return text content");
    }

    const jsonStr = textContent.text
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    let parsed;
    try {
      parsed = JSON.parse(jsonStr);
    } catch (parseErr) {
      try {
        parsed = JSON.parse(jsonrepair(jsonStr));
      } catch (repairErr) {
        throw new Error(
          `Failed to parse Claude response as JSON: ${parseErr.message}`
        );
      }
    }

    const { getEmbedding } = await import("@/lib/embeddings");
    const embeddingBuffer = await getEmbedding(rawText);

    const structuredDataStr =
      typeof parsed.structured_data === "string"
        ? parsed.structured_data
        : JSON.stringify(parsed.structured_data ?? {});
    const now = new Date().toISOString();

    const result = await db
      .prepare(
        `UPDATE knowledge SET
          module = ?, tags = ?, raw_text = ?, structured_data = ?,
          embedding = ?, updated_at = ?
          WHERE id = ?`
      )
      .run(
        parsed.module,
        JSON.stringify(parsed.tags ?? []),
        rawText,
        structuredDataStr,
        embeddingBuffer,
        now,
        id
      );

    if (result.changes === 0) {
      return Response.json(
        { error: "Knowledge record not found" },
        { status: 404 }
      );
    }

    const tagsStr =
      Array.isArray(parsed.tags) && parsed.tags.length > 0
        ? parsed.tags.join(", ")
        : "untagged";

    return Response.json({
      confirmation: `Replaced as ${parsed.module} — tagged ${tagsStr}`,
    });
  } catch (err) {
    const message = err?.message || "Replace failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
