import { NextResponse } from "next/server";
const db = require("@/lib/db");

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim() || "";

    let rows;
    if (q === "") {
      rows = db
        .prepare(
          "SELECT id, name, created_at, updated_at, messages FROM conversations ORDER BY updated_at DESC"
        )
        .all();
    } else {
      rows = db
        .prepare(
          `SELECT c.id, c.name, c.created_at, c.updated_at, c.messages
           FROM conversations c
           WHERE c.id IN (SELECT rowid FROM conversations_fts WHERE conversations_fts MATCH ?)
           ORDER BY c.updated_at DESC`
        )
        .all(q);
    }

    const conversations = rows.map((r) => ({
      id: r.id,
      name: r.name,
      created_at: r.created_at,
      updated_at: r.updated_at,
      messages: JSON.parse(r.messages || "[]"),
    }));

    return NextResponse.json(conversations);
  } catch (err) {
    const message = err?.message || "Search failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
