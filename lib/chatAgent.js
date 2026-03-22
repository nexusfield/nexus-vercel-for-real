const Anthropic = require("@anthropic-ai/sdk");
const { GoogleGenAI } = require("@google/genai");
const { getEnv } = require("./getEnv");

const anthropic = new Anthropic({
  apiKey: getEnv("ANTHROPIC_API_KEY"),
});

const NEXUS_SYSTEM_PROMPT = `You are NEXUS, a personal intelligence system. You are given retrieved knowledge chunks as candidates. First, determine which chunks are actually relevant to the user's latest message, then answer using those relevant chunks first.

Internally assign a confidence level (strong, partial, none) based on how well the relevant chunks support the answer:
- strong: chunks directly answer the user's request
- partial: chunks are somewhat relevant but incomplete
- none: chunks do not meaningfully address the request

Do not output these labels explicitly unless the user asks. If confidence is none, answer from your own knowledge and clearly state that the retrieved context was insufficient. If relevance is uncertain, prefer using potentially relevant chunks rather than discarding all context. Always be direct and specific.

When the user asks what is in memory/context, summarize what is present in the provided chunks. Do not claim hidden security policies or refuse to discuss "system prompts" if the request is clearly about user-authored content stored in knowledge.

DUMP/SAVE INTENT — Trigger save mode ONLY when the user's latest message is an explicit request to save/store/dump to memory or the knowledge base (for example: "save this", "dump this", "save to knowledge", "store this conversation", "add this to memory"). If the request is ambiguous or is just asking for analysis/summarization, DO NOT trigger save mode.

When (and only when) save mode should be triggered, respond with EXACTLY this format, starting with the marker as the first characters of the response:

[SAVE_TO_KNOWLEDGE]
{A clean synthesis suitable for long-term memory. Include key facts, decisions, and context. No meta-commentary.}
---
{One specific follow-up question that improves how this should be stored.}
---

In every other case, respond normally and do not include [SAVE_TO_KNOWLEDGE].`;

function toAnthropicMessage(msg) {
  const role = msg.role === "assistant" ? "assistant" : "user";
  let content = msg.content;
  if (typeof content !== "string") {
    content = Array.isArray(content)
      ? content.map((p) => (p.type === "text" ? p.text : "")).join("")
      : String(content ?? "");
  }
  return { role, content };
}

function toGeminiContent(msg) {
  const role = msg.role === "assistant" ? "model" : "user";
  let text = msg.content;
  if (typeof text !== "string") {
    text = Array.isArray(text)
      ? text.map((p) => (p.type === "text" ? p.text : "")).join("")
      : String(text ?? "");
  }
  return { role, parts: [{ text }] };
}

function buildContextBlock(retrievedChunks) {
  return [
    "--- Context ---",
    "Retrieved candidate chunks:",
    retrievedChunks.length > 0
      ? retrievedChunks
          .map((c) => {
            const structured =
              c.structured_data != null
                ? typeof c.structured_data === "string"
                  ? c.structured_data
                  : JSON.stringify(c.structured_data)
                : "";
            return `[${c.module}] ${c.raw_text}${structured ? `\nStructured: ${structured}` : ""}`;
          })
          .join("\n\n")
      : "(No retrieved chunks)",
    "---",
  ].join("\n");
}

async function* streamTextChunks(iterable) {
  for await (const chunk of iterable) {
    let text =
      typeof chunk === "string"
        ? chunk
        : chunk?.text ?? chunk?.delta?.text;
    if (!text && chunk?.candidates?.[0]?.content?.parts) {
      text = chunk.candidates[0].content.parts
        .filter((p) => p?.text)
        .map((p) => p.text)
        .join("");
    }
    if (typeof text === "string" && text) yield text;
  }
}

async function runChatAgent(
  userMessage,
  retrievedChunks,
  conversationHistory,
  model = "claude-sonnet-4-6",
  geminiApiKey,
  activeModeInstruction,
  profileBlock
) {
  const contextBlock = buildContextBlock(retrievedChunks || []);
  const promptLayers = [];
  if (profileBlock && profileBlock.trim()) {
    promptLayers.push(profileBlock.trim());
  }
  if (activeModeInstruction && activeModeInstruction.trim()) {
    promptLayers.push(activeModeInstruction.trim());
  }
  promptLayers.push(NEXUS_SYSTEM_PROMPT);
  promptLayers.push(contextBlock);
  const systemPrompt = promptLayers.join("\n\n---\n\n");

  const useGemini = model.startsWith("gemini-");

  if (useGemini) {
    const key = geminiApiKey || getEnv("GEMINI_API_KEY");
    const ai = new GoogleGenAI({ apiKey: key });
    const contents = (conversationHistory || []).map(toGeminiContent);
    contents.push({ role: "user", parts: [{ text: userMessage }] });

    const stream = await ai.models.generateContentStream({
      model,
      contents,
      config: {
        systemInstruction: systemPrompt,
        maxOutputTokens: 4096,
      },
    });

    return streamTextChunks(stream);
  }

  const messages = (conversationHistory || []).map(toAnthropicMessage);
  messages.push({ role: "user", content: userMessage });

  const messageStream = anthropic.messages.stream({
    max_tokens: 4096,
    system: systemPrompt,
    messages,
    model,
  });

  async function* streamTextFromMessageStream() {
    const queue = [];
    let ended = false;
    let resolveWait = null;

    messageStream.on("text", (text) => {
      queue.push(text);
      if (resolveWait) {
        resolveWait();
        resolveWait = null;
      }
    });
    messageStream.on("end", () => {
      ended = true;
      if (resolveWait) {
        resolveWait();
        resolveWait = null;
      }
    });
    messageStream.on("error", (err) => {
      ended = true;
      queue.push({ __error: err });
      if (resolveWait) {
        resolveWait();
        resolveWait = null;
      }
    });

    while (!ended || queue.length > 0) {
      if (queue.length > 0) {
        const item = queue.shift();
        if (item && typeof item === "object" && item.__error) throw item.__error;
        if (typeof item === "string" && item) yield item;
      } else if (!ended) {
        await new Promise((r) => {
          resolveWait = r;
        });
      }
    }
  }

  return streamTextFromMessageStream();
}

module.exports = { runChatAgent };
