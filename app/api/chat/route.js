import { getEnv } from "@/lib/getEnv";
import { auth } from "@/auth";

export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const session = await auth();
    const userId = session?.user?.email || session?.user?.id || "";
    const body = await request.json();
    const { userMessage, conversationHistory, model, activeModeInstruction } = body;

    if (!userMessage || typeof userMessage !== "string") {
      return Response.json({ error: "userMessage is required" }, { status: 400 });
    }

    const apiKey = getEnv("ANTHROPIC_API_KEY");
    if (!apiKey?.trim()) {
      return Response.json(
        { error: "ANTHROPIC_API_KEY is missing. Add it to .env.local and restart the dev server." },
        { status: 500 }
      );
    }

    // GEMINI_API_KEY is required for ALL chats (embedding step in navigation agent)
    const geminiKey = getEnv("GEMINI_API_KEY");
    if (!geminiKey?.trim()) {
      return Response.json(
        { error: "GEMINI_API_KEY is missing. Add it to .env.local and restart the dev server. (Required for embeddings and Gemini models.)" },
        { status: 500 }
      );
    }

    const selectedModel = model && typeof model === "string" ? model : "claude-sonnet-4-6";

    const { runNavigationAgent } = await import("@/lib/navigationAgent");
    const { runChatAgent } = await import("@/lib/chatAgent");
    const { assembleProfileBlock } = await import("@/lib/profile");

    const chunks = await runNavigationAgent(userMessage);
    let profileBlock = "";
    if (userId) {
      try {
        profileBlock = await assembleProfileBlock(userId);
      } catch (profileErr) {
        console.warn("[chat] Profile assembly failed:", profileErr?.message);
      }
    }
    const chatStream = await runChatAgent(
      userMessage,
      chunks,
      conversationHistory ?? [],
      selectedModel,
      geminiKey,
      activeModeInstruction,
      profileBlock
    );

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
          let friendly = raw;
          if (/429|RESOURCE_EXHAUSTED|quota|rate.?limit/i.test(raw)) {
            friendly = "Gemini API rate limit exceeded. Wait a minute and try again, or switch to a Claude model.";
          } else if (/credit balance|too low|Plans & Billing|invalid_request_error/i.test(raw)) {
            friendly = "Anthropic API: Your credit balance is too low. Add credits at console.anthropic.com or switch to a Gemini model.";
          }
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
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "X-Accel-Buffering": "no",
        "X-Nexus-Chunks": String(chunks.length),
      },
    });
  } catch (err) {
    console.error("[chat] Error:", err?.message, err?.cause);
    let raw = err?.message || err?.cause?.message || err?.error?.message || err?.toString?.() || "Chat failed";
    try {
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      raw = parsed?.error?.message || parsed?.message || raw;
    } catch {}
    let msg = raw;
    if (/429|RESOURCE_EXHAUSTED|quota|rate.?limit|Too Many Requests/i.test(raw)) {
      msg = "Gemini API rate limit exceeded. Wait a minute and try again, or switch to a Claude model.";
    } else if (/credit balance|too low|Plans & Billing|invalid_request_error/i.test(raw)) {
      msg = "Anthropic API: Your credit balance is too low. Go to console.anthropic.com → Plans & Billing to add credits, or switch to a Gemini model.";
    } else {
      const isEmbeddingOrGemini =
        /Gemini embedding failed|GEMINI_API_KEY|generativelanguage\.googleapis\.com|embedContent/i.test(raw) ||
        (err?.cause?.code === "ECONNREFUSED");
      const hint = isEmbeddingOrGemini
        ? " — Ensure GEMINI_API_KEY is set and Gemini API access is active for your project."
        : "";
      msg = raw + hint;
    }
    return Response.json({ error: msg }, { status: 500 });
  }
}
