const Anthropic = require("@anthropic-ai/sdk");
const { v4: uuidv4 } = require("uuid");
const { jsonrepair } = require("jsonrepair");
const db = require("./db");
const { getEmbedding } = require("./embeddings");
const { getEnv } = require("./getEnv");

function getAnthropicClient() {
  const apiKey = getEnv("ANTHROPIC_API_KEY");
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is missing. Add it to .env.local and restart the dev server."
    );
  }
  return new Anthropic({ apiKey });
}

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

const WORD_COUNT_THRESHOLD = 225;
const TARGET_CHUNK_WORDS = { min: 200, max: 225 };
const OVERLAP_WORDS = 25;

function buildStructuralTags(unitId, chunkIndex, chunkCount) {
  return [
    `unit:${unitId}`,
    `part:${chunkIndex + 1}/${chunkCount}`,
    "memory_unit",
  ];
}

function mergeTags(modelTags, structuralTags) {
  const merged = new Set();
  for (const tag of Array.isArray(modelTags) ? modelTags : []) {
    const value = String(tag || "").trim();
    if (value) merged.add(value);
  }
  for (const tag of structuralTags) {
    const value = String(tag || "").trim();
    if (value) merged.add(value);
  }
  return Array.from(merged);
}

function countWords(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function splitIntoChunks(rawText) {
  const chunks = [];
  const paragraphs = rawText.split(/\n\s*\n/).filter((p) => p.trim());

  if (paragraphs.length === 0) {
    return [rawText];
  }

  const sentences = (text) =>
    text
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);

  let currentChunk = [];
  let currentWordCount = 0;

  for (const para of paragraphs) {
    const paraWordCount = countWords(para);

    if (paraWordCount > TARGET_CHUNK_WORDS.max) {
      if (currentChunk.length > 0) {
        chunks.push(currentChunk.join("\n\n"));
        currentChunk = [];
        currentWordCount = 0;
      }
      const sents = sentences(para);
      let sentChunk = [];
      let sentWordCount = 0;
      for (const sent of sents) {
        const sentWords = countWords(sent);
        if (sentWords > TARGET_CHUNK_WORDS.max) {
          if (sentChunk.length > 0) {
            chunks.push(sentChunk.join(" "));
            sentChunk = [];
            sentWordCount = 0;
          }
          const words = sent.trim().split(/\s+/).filter(Boolean);
          let start = 0;
          while (start < words.length) {
            const end = Math.min(start + TARGET_CHUNK_WORDS.max, words.length);
            chunks.push(words.slice(start, end).join(" "));
            if (end >= words.length) break;
            start = end - OVERLAP_WORDS;
          }
        } else if (sentChunk.length > 0 && sentWordCount + sentWords > TARGET_CHUNK_WORDS.max) {
          chunks.push(sentChunk.join(" "));
          const overlapSents = [];
          let overlapCount = 0;
          for (let i = sentChunk.length - 1; i >= 0 && overlapCount < OVERLAP_WORDS; i--) {
            overlapSents.unshift(sentChunk[i]);
            overlapCount += countWords(sentChunk[i]);
          }
          sentChunk = overlapSents;
          sentWordCount = overlapCount;
          sentChunk.push(sent);
          sentWordCount += sentWords;
        } else {
          sentChunk.push(sent);
          sentWordCount += sentWords;
        }
      }
      if (sentChunk.length > 0) chunks.push(sentChunk.join(" "));
    } else if (currentWordCount + paraWordCount > TARGET_CHUNK_WORDS.max && currentChunk.length > 0) {
      chunks.push(currentChunk.join("\n\n"));
      const overlapParas = [];
      let overlapCount = 0;
      for (let i = currentChunk.length - 1; i >= 0 && overlapCount < OVERLAP_WORDS; i--) {
        overlapParas.unshift(currentChunk[i]);
        overlapCount += countWords(currentChunk[i]);
      }
      currentChunk = overlapParas;
      currentWordCount = overlapCount;
      currentChunk.push(para);
      currentWordCount += paraWordCount;
    } else {
      currentChunk.push(para);
      currentWordCount += paraWordCount;
    }
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk.join("\n\n"));
  }

  return chunks.length > 0 ? chunks : [rawText];
}

async function processSingleChunk(rawText, memoryMeta) {
  const anthropic = getAnthropicClient();
  // Step 1: Call Claude API
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

  const jsonStr = textContent.text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  let parsed;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (parseErr) {
    try {
      const repaired = jsonrepair(jsonStr);
      parsed = JSON.parse(repaired);
    } catch (repairErr) {
      throw new Error(
        `Failed to parse Claude response as JSON: ${parseErr.message}. Repair attempt: ${repairErr.message}`
      );
    }
  }

  // Step 2: Get embedding via Gemini (text-embedding-004, 768 dimensions)
  const embeddingBuffer = await getEmbedding(rawText);

  // Step 3: Write to knowledge table
  const id = uuidv4();
  const now = new Date().toISOString();
  const structuralTags = buildStructuralTags(
    memoryMeta.unitId,
    memoryMeta.chunkIndex,
    memoryMeta.chunkCount
  );
  const combinedTags = mergeTags(parsed.tags, structuralTags);

  await db.prepare(
    `INSERT INTO knowledge (
      id, module, entity_links, tags, source,
      created_at, updated_at, embedding, raw_text, structured_data
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    parsed.module,
    JSON.stringify(parsed.entity_links ?? []),
    JSON.stringify(combinedTags),
    parsed.source ?? "user_dump",
    now,
    now,
    embeddingBuffer,
    rawText,
    typeof parsed.structured_data === "string"
      ? parsed.structured_data
      : JSON.stringify(parsed.structured_data ?? {})
  );

  return { id, module: parsed.module, tags: combinedTags };
}

async function runIntakeAgent(rawText) {
  const wordCount = countWords(rawText);
  const unitId = uuidv4();

  if (wordCount < WORD_COUNT_THRESHOLD) {
    const result = await processSingleChunk(rawText, {
      unitId,
      chunkIndex: 0,
      chunkCount: 1,
    });
    const tagsStr =
      Array.isArray(result.tags) && result.tags.length > 0
        ? result.tags.join(", ")
        : "untagged";
    return { confirmation: `Stored as ${result.module} — tagged ${tagsStr}`, ids: [result.id] };
  }

  const chunks = splitIntoChunks(rawText);
  const results = [];

  for (let i = 0; i < chunks.length; i += 1) {
    const chunk = chunks[i];
    const result = await processSingleChunk(chunk, {
      unitId,
      chunkIndex: i,
      chunkCount: chunks.length,
    });
    results.push(result);
  }

  const modules = [...new Set(results.map((r) => r.module))].join(", ");
  const allTags = [...new Set(results.flatMap((r) => r.tags || []))];
  const tagsStr = allTags.length > 0 ? allTags.join(", ") : "untagged";

  return {
    confirmation: `Split into ${results.length} records — stored as ${modules} tagged ${tagsStr}`,
    ids: results.map((r) => r.id),
  };
}

module.exports = { runIntakeAgent };
