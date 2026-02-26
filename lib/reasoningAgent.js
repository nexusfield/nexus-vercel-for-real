const Anthropic = require("@anthropic-ai/sdk");
const { jsonrepair } = require("jsonrepair");

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const SUMMARY_SYSTEM_PROMPT = `You are a conversation summarizer. Your job is to compress a chat conversation into a brief summary.

Summarize the conversation in 3 sentences or less. Capture only what is essential for answering the next question. Be concise and focus on: user intent, key topics discussed, and any constraints or context that matter for follow-up.`;

const EVALUATION_SYSTEM_PROMPT = `You are a context evaluator for a knowledge retrieval system. Given a conversation summary and a set of retrieved knowledge chunks, you must evaluate which chunks actually fit what the user is asking about.

Return ONLY a valid JSON object with exactly these fields:
- relevantChunkIds: an array of chunk IDs (strings) that are actually relevant to the query. Exclude chunks that do not fit.
- confidenceSignal: one of "strong", "partial", or "none"
  - "strong": chunks clearly and directly answer the user's question
  - "partial": some chunks are relevant but incomplete or tangential
  - "none": no chunks meaningfully address what was asked`;

function formatConversation(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return "(No conversation yet)";
  }
  return messages
    .map((m) => {
      const role = m.role === "user" ? "User" : "Assistant";
      const content = typeof m.content === "string" ? m.content : m.content?.[0]?.text ?? JSON.stringify(m.content);
      return `${role}: ${content}`;
    })
    .join("\n\n");
}

async function runReasoningAgent(chunks, conversationHistory) {
  // Step 1: Generate compressed summary of conversation

  const conversationText = formatConversation(conversationHistory);

  const summaryMessage = await anthropic.messages.create({
    max_tokens: 256,
    system: SUMMARY_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Summarize this conversation:\n\n${conversationText}`,
      },
    ],
    model: "claude-sonnet-4-6",
  });

  const summaryContent = summaryMessage.content.find((block) => block.type === "text");
  const chatSummary =
    summaryContent?.type === "text" ? summaryContent.text.trim() : "(No summary)";

  // Step 2: Evaluate chunks and build context package

  if (chunks.length === 0) {
    return {
      relevantChunks: [],
      chatSummary,
      confidenceSignal: "none",
    };
  }

  const chunksForEval = chunks.map((c) => ({
    id: c.id,
    module: c.module,
    tags: c.tags,
    raw_text: c.raw_text,
    structured_data: c.structured_data,
  }));

  const evaluationMessage = await anthropic.messages.create({
    max_tokens: 1024,
    system: EVALUATION_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Conversation summary:\n${chatSummary}\n\nRetrieved chunks:\n${JSON.stringify(chunksForEval, null, 2)}\n\nWhich chunk IDs are relevant? What is the confidence signal?`,
      },
    ],
    model: "claude-sonnet-4-6",
  });

  const evalContent = evaluationMessage.content.find((block) => block.type === "text");
  if (!evalContent || evalContent.type !== "text") {
    return {
      relevantChunks: chunks,
      chatSummary,
      confidenceSignal: "partial",
    };
  }

  let parsed;
  try {
    const jsonStr = evalContent.text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    try {
      parsed = JSON.parse(jsonStr);
    } catch (parseErr) {
      const repaired = jsonrepair(jsonStr);
      parsed = JSON.parse(repaired);
    }
  } catch {
    return {
      relevantChunks: chunks,
      chatSummary,
      confidenceSignal: "partial",
    };
  }

  const relevantIds = new Set(parsed.relevantChunkIds ?? []);
  let relevantChunks = chunks.filter((c) => relevantIds.has(c.id));
  const confidenceSignal =
    ["strong", "partial", "none"].includes(parsed.confidenceSignal) ? parsed.confidenceSignal : "partial";

  // Fallback: if reasoning filtered out everything but we had chunks, pass all (avoids over-filtering)
  if (relevantChunks.length === 0 && chunks.length > 0) {
    relevantChunks = chunks;
  }

  return {
    relevantChunks,
    chatSummary,
    confidenceSignal,
  };
}

module.exports = { runReasoningAgent };
