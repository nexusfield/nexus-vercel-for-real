import { NextResponse } from "next/server";
const db = require("@/lib/db");

export async function GET() {
  try {
    const rows = await db
      .prepare("SELECT id, name, created_at FROM folders ORDER BY created_at ASC")
      .all();
    return NextResponse.json(rows);
  } catch (err) {
    const message = err?.message || "Failed to fetch folders";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { name } = body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json(
        { error: "name is required" },
        { status: 400 }
      );
    }

    await db.prepare("INSERT INTO folders (name) VALUES (?)").run(name.trim());

    const { id } = await db.prepare("SELECT last_insert_rowid() as id").get();
    const row = await db
      .prepare("SELECT id, name, created_at FROM folders WHERE id = ?")
      .get(id);

    return NextResponse.json(row);
  } catch (err) {
    const message = err?.message || "Failed to create folder";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
