import { getEnv } from "@/lib/getEnv";

export async function POST(request) {
  try {
    const body = await request.json();
    const { userMessage, conversationHistory, model } = body;

    if (!userMessage || typeof userMessage !== "string") {
      return Response.json({ error: "userMessage is required" }, { status: 400 });
    }

    const selectedModel = model && typeof model === "string" ? model : "claude-sonnet-4-6";
    const useGemini = selectedModel.startsWith("gemini-");

    const geminiKey = getEnv("GEMINI_API_KEY");
    if (useGemini && !geminiKey) {
      return Response.json(
        { error: "GEMINI_API_KEY is missing. Add it to .env.local and restart the dev server." },
        { status: 500 }
      );
    }
    if (!useGemini && !getEnv("ANTHROPIC_API_KEY")) {
      return Response.json(
        { error: "ANTHROPIC_API_KEY is missing. Add it to .env.local and restart the dev server." },
        { status: 500 }
      );
    }

    const { runNavigationAgent } = await import("@/lib/navigationAgent");
    const { runReasoningAgent } = await import("@/lib/reasoningAgent");
    const { runChatAgent } = await import("@/lib/chatAgent");

    const chunks = await runNavigationAgent(userMessage);
    const contextPackage = await runReasoningAgent(chunks, conversationHistory ?? []);
    const chatStream = await runChatAgent(userMessage, contextPackage, conversationHistory ?? [], selectedModel, geminiKey);

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of chatStream) {
            if (typeof chunk === "string") {
              controller.enqueue(encoder.encode(chunk));
            }
          }
        } catch (err) {
          const raw = err?.message || "";
          const friendly = /429|RESOURCE_EXHAUSTED|quota|rate.?limit/i.test(raw)
            ? "Gemini API rate limit exceeded. Wait a minute and try again, or switch to a Claude model."
            : raw;
          controller.enqueue(encoder.encode(`\n[Error: ${friendly}]`));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
      },
    });
  } catch (err) {
    let raw = err?.message || err?.cause?.message || err?.toString?.() || "Chat failed";
    try {
      const parsed = JSON.parse(raw);
      raw = parsed?.error?.message || parsed?.message || raw;
    } catch {}
    let msg = raw;
    if (/429|RESOURCE_EXHAUSTED|quota|rate.?limit|Too Many Requests/i.test(raw)) {
      msg = "Gemini API rate limit exceeded. Wait a minute and try again, or switch to a Claude model.";
    } else {
      const isOllama =
        /ECONNREFUSED|fetch failed|Ollama|localhost:11434|connection refused/i.test(raw) ||
        (err?.cause?.code === "ECONNREFUSED");
      const hint = isOllama
        ? " — Is Ollama running? Run `ollama serve` and `ollama pull nomic-embed-text`"
        : "";
      msg = raw + hint;
    }
    return Response.json({ error: msg }, { status: 500 });
  }
}
