import { NextResponse } from "next/server";
const db = require("@/lib/db");

export async function PATCH(request, { params }) {
  try {
    const id = params?.id;
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const body = await request.json();
    const { messages, name, folder_id } = body;

    const updates = [];
    const values = [];

    if (messages !== undefined) {
      updates.push("messages = ?");
      values.push(
        typeof messages === "string" ? messages : JSON.stringify(messages)
      );
    }
    if (name !== undefined) {
      updates.push("name = ?");
      values.push(name);
    }
    if (folder_id !== undefined) {
      updates.push("folder_id = ?");
      values.push(folder_id === null ? null : parseInt(folder_id, 10));
    }

    if (updates.length === 0) {
      return NextResponse.json(
        { error: "At least one of messages, name, or folder_id is required" },
        { status: 400 }
      );
    }

    updates.push("updated_at = CURRENT_TIMESTAMP");
    values.push(parseInt(id, 10));

    const sql = `UPDATE conversations SET ${updates.join(", ")} WHERE id = ?`;
    const result = await db.prepare(sql).run(...values);

    if (result.changes === 0) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }

    const row = await db
      .prepare("SELECT id, name, created_at, updated_at, messages, folder_id FROM conversations WHERE id = ?")
      .get(parseInt(id, 10));
    return NextResponse.json({
      id: row.id,
      name: row.name,
      created_at: row.created_at,
      updated_at: row.updated_at,
      messages: JSON.parse(row.messages || "[]"),
      folder_id: row.folder_id ?? null,
    });
  } catch (err) {
    const message = err?.message || "Failed to update conversation";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const id = params?.id;
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const conversationId = parseInt(id, 10);
    const result = await db.prepare("DELETE FROM conversations WHERE id = ?").run(conversationId);

    if (result.changes === 0) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err?.message || "Failed to delete conversation";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
