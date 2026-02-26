import { NextResponse } from "next/server";
const db = require("@/lib/db");

export async function GET() {
  try {
    const rows = db
      .prepare(
        "SELECT id, name, created_at, updated_at, messages FROM conversations ORDER BY updated_at DESC"
      )
      .all();
    const conversations = rows.map((r) => ({
      id: r.id,
      name: r.name,
      created_at: r.created_at,
      updated_at: r.updated_at,
      messages: JSON.parse(r.messages || "[]"),
    }));
    return NextResponse.json(conversations);
  } catch (err) {
    const message = err?.message || "Failed to fetch conversations";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST() {
  try {
    db.prepare("INSERT INTO conversations (name) VALUES ('New Chat')").run();
    const { id } = db.prepare("SELECT last_insert_rowid() as id").get();
    return NextResponse.json({ id, name: "New Chat" });
  } catch (err) {
    const message = err?.message || "Failed to create conversation";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
