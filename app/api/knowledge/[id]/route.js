import { NextResponse } from "next/server";
const db = require("@/lib/db");

export async function PATCH(request, { params }) {
  try {
    const id = params?.id;
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const body = await request.json();
    const { structured_data, raw_text, embedding, entity_links } = body;

    const updates = [];
    const values = [];

    if (structured_data !== undefined) {
      updates.push("structured_data = ?");
      values.push(
        typeof structured_data === "string"
          ? structured_data
          : JSON.stringify(structured_data)
      );
    }
    if (raw_text !== undefined) {
      updates.push("raw_text = ?");
      values.push(raw_text);
    }
    if (embedding !== undefined) {
      const buffer =
        typeof embedding === "string"
          ? Buffer.from(embedding, "base64")
          : Buffer.isBuffer(embedding)
            ? embedding
            : null;
      if (buffer) {
        updates.push("embedding = ?");
        values.push(buffer);
      }
    }
    if (entity_links !== undefined) {
      updates.push("entity_links = ?");
      values.push(
        Array.isArray(entity_links)
          ? JSON.stringify(entity_links)
          : typeof entity_links === "string"
            ? entity_links
            : "[]"
      );
    }

    if (updates.length === 0) {
      return NextResponse.json(
        { error: "At least one of structured_data, raw_text, embedding, or entity_links is required" },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    updates.push("updated_at = ?");
    values.push(now);
    values.push(id);

    const sql = `UPDATE knowledge SET ${updates.join(", ")} WHERE id = ?`;
    const result = await db.prepare(sql).run(...values);

    if (result.changes === 0) {
      return NextResponse.json(
        { error: "Knowledge record not found" },
        { status: 404 }
      );
    }

    const row = await db
      .prepare(
        "SELECT id, structured_data, raw_text, module, tags, created_at, updated_at FROM knowledge WHERE id = ?"
      )
      .get(id);

    let parsedStructuredData;
    try {
      parsedStructuredData = JSON.parse(row.structured_data || "{}");
    } catch {
      parsedStructuredData = row.structured_data;
    }

    return NextResponse.json({
      id: row.id,
      structured_data: parsedStructuredData,
      raw_text: row.raw_text,
      module: row.module,
      tags: JSON.parse(row.tags || "[]"),
      created_at: row.created_at,
      updated_at: row.updated_at,
    });
  } catch (err) {
    const message = err?.message || "Failed to update knowledge record";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const id = params?.id;
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const result = await db.prepare("DELETE FROM knowledge WHERE id = ?").run(id);

    if (result.changes === 0) {
      return NextResponse.json(
        { error: "Knowledge record not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err?.message || "Failed to delete knowledge record";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
