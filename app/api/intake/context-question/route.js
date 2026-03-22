import { getEnv } from "@/lib/getEnv";
import Anthropic from "@anthropic-ai/sdk";

const CONTEXT_QUESTION_PROMPT = `You are analyzing a piece of text that is about to be stored in a personal intelligence system. Your job is to ask the single most important question that would improve how this specific content gets stored and retrieved later.
Read the content carefully. Identify what type of content it is — personal belief, project update, relationship note, historical writing, current thinking, research, idea, reflection. Then ask the one question whose answer would most change how this content should be understood in the future.
Examples of good questions based on content type: For old writing — ask when it was written and whether it still reflects current thinking. For a project update — ask what the current status is and what the main blocker is. For a person or relationship note — ask what the most important thing to remember about this person is. For a belief or opinion — ask whether this is settled thinking or still being worked through. For an idea — ask what problem this is actually solving.
Never ask generic questions like what is this about or can you provide more context. The question must be specific to what is actually in the text. Return only the question, nothing else.`;

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
    const { rawText } = body ?? {};

    if (!rawText || typeof rawText !== "string") {
      return Response.json({ error: "rawText is required" }, { status: 400 });
    }

    const anthropic = new Anthropic({ apiKey });
    const message = await anthropic.messages.create({
      max_tokens: 256,
      messages: [
        {
          role: "user",
          content: `${CONTEXT_QUESTION_PROMPT}\n\n---\n\n${rawText}`,
        },
      ],
      model: "claude-haiku-4-5-20251001",
    });

    const textBlock = message.content.find((block) => block.type === "text");
    const question =
      textBlock?.type === "text" ? textBlock.text.trim() : "How should this be stored?";

    return Response.json({ question });
  } catch (err) {
    const message = err?.message || "Failed to generate context question";
    return Response.json({ error: message }, { status: 500 });
  }
}
