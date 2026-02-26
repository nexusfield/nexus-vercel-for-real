import { NextResponse } from "next/server";
const Anthropic = require("@anthropic-ai/sdk");
const db = require("@/lib/db");

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const TITLE_PROMPT = (firstMessage) =>
  `Generate a conversation title from this message. Maximum 5 words. No punctuation. No quotes. Return only the title, nothing else: ${firstMessage}`;

export async function POST(request, { params }) {
  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    return NextResponse.json(
      {
        error:
          "ANTHROPIC_API_KEY is missing. Add it to .env.local and restart the dev server.",
      },
      { status: 500 }
    );
  }

  try {
    const id = params?.id;
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const body = await request.json();
    const { firstMessage } = body;

    if (!firstMessage || typeof firstMessage !== "string") {
      return NextResponse.json(
        { error: "firstMessage is required" },
        { status: 400 }
      );
    }

    const conversationId = parseInt(id, 10);
    const existing = db
      .prepare("SELECT id FROM conversations WHERE id = ?")
      .get(conversationId);
    if (!existing) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }

    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 50,
      messages: [{ role: "user", content: TITLE_PROMPT(firstMessage) }],
    });

    const textBlock = response.content?.find((b) => b.type === "text");
    const title = (textBlock?.text || "New Chat")
      .trim()
      .replace(/^["']|["']$/g, "")
      .slice(0, 100) || "New Chat";

    db.prepare(
      "UPDATE conversations SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).run(title, conversationId);

    return NextResponse.json({ name: title });
  } catch (err) {
    const message = err?.message || "Failed to generate title";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
