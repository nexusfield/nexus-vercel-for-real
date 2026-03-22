import { NextResponse } from "next/server";
const db = require("@/lib/db");

export async function PATCH(request, { params }) {
  try {
    const id = params?.id;
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const body = await request.json();
    const { name, trigger_phrase, instruction } = body;

    const updates = [];
    const values = [];

    if (name !== undefined) {
      updates.push("name = ?");
      values.push(name);
    }
    if (trigger_phrase !== undefined) {
      updates.push("trigger_phrase = ?");
      values.push(trigger_phrase);
    }
    if (instruction !== undefined) {
      updates.push("instruction = ?");
      values.push(instruction);
    }

    if (updates.length === 0) {
      return NextResponse.json(
        { error: "At least one of name, trigger_phrase, or instruction is required" },
        { status: 400 }
      );
    }

    values.push(parseInt(id, 10));

    const sql = `UPDATE modes SET ${updates.join(", ")} WHERE id = ?`;
    const result = await db.prepare(sql).run(...values);

    if (result.changes === 0) {
      return NextResponse.json(
        { error: "Mode not found" },
        { status: 404 }
      );
    }

    const row = await db
      .prepare(
        "SELECT id, name, trigger_phrase, instruction, created_at FROM modes WHERE id = ?"
      )
      .get(parseInt(id, 10));
    return NextResponse.json(row);
  } catch (err) {
    const message = err?.message || "Failed to update mode";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const id = params?.id;
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const modeId = parseInt(id, 10);
    const result = await db.prepare("DELETE FROM modes WHERE id = ?").run(modeId);

    if (result.changes === 0) {
      return NextResponse.json(
        { error: "Mode not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err?.message || "Failed to delete mode";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
