import { NextResponse } from "next/server";
const db = require("@/lib/db");

export async function GET() {
  try {
    const rows = await db
      .prepare(
        "SELECT id, name, trigger_phrase, instruction, created_at FROM modes ORDER BY created_at DESC"
      )
      .all();
    return NextResponse.json(rows);
  } catch (err) {
    const message = err?.message || "Failed to fetch modes";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { name, trigger_phrase, instruction } = body;

    if (!name || instruction === undefined) {
      return NextResponse.json(
        { error: "name and instruction are required" },
        { status: 400 }
      );
    }

    await db.prepare(
      "INSERT INTO modes (name, trigger_phrase, instruction) VALUES (?, ?, ?)"
    ).run(name, trigger_phrase ?? null, instruction);

    const { id } = await db.prepare("SELECT last_insert_rowid() as id").get();
    const row = await db
      .prepare(
        "SELECT id, name, trigger_phrase, instruction, created_at FROM modes WHERE id = ?"
      )
      .get(id);

    return NextResponse.json(row);
  } catch (err) {
    const message = err?.message || "Failed to create mode";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
