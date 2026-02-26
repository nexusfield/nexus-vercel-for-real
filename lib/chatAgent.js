const Anthropic = require("@anthropic-ai/sdk");
const { GoogleGenAI } = require("@google/genai");
const { getEnv } = require("./getEnv");

const anthropic = new Anthropic({
  apiKey: getEnv("ANTHROPIC_API_KEY"),
});

const NEXUS_SYSTEM_PROMPT = `You are NEXUS, a personal intelligence system. Answer the user's question using the provided context chunks first. If the context is thin or confidence is 'none', use your own knowledge and clearly indicate you are doing so. Always be direct and specific.`;

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

function buildContextBlock(contextPackage) {
  const { relevantChunks, chatSummary, confidenceSignal } = contextPackage;
  return [
    "--- Context ---",
    `Chat summary: ${chatSummary}`,
    `Confidence: ${confidenceSignal}`,
    "",
    "Relevant chunks:",
    relevantChunks.length > 0
      ? relevantChunks
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
      : "(No relevant chunks)",
    "---",
  ].join("\n");
}

async function* streamTextChunks(iterable) {
  for await (const chunk of iterable) {
    const text = typeof chunk === "string" ? chunk : chunk?.text ?? chunk?.delta?.text;
    if (typeof text === "string" && text) yield text;
  }
}

async function runChatAgent(userMessage, contextPackage, conversationHistory, model = "claude-sonnet-4-6", geminiApiKey) {
  const contextBlock = buildContextBlock(contextPackage);
  const systemPrompt = `${NEXUS_SYSTEM_PROMPT}\n\n${contextBlock}`;

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

  const stream = await anthropic.messages.create({
    max_tokens: 4096,
    system: systemPrompt,
    messages,
    model,
    stream: true,
  });

  async function* anthropicToText() {
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta?.text) {
        yield event.delta.text;
      }
    }
  }

  return anthropicToText();
}

module.exports = { runChatAgent };
