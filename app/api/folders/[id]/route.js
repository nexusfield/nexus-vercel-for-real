import { NextResponse } from "next/server";
const db = require("@/lib/db");

export async function PATCH(request, { params }) {
  try {
    const id = params?.id;
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const body = await request.json();
    const { name } = body;

    if (name === undefined || typeof name !== "string" || !name.trim()) {
      return NextResponse.json(
        { error: "name is required and must be non-empty" },
        { status: 400 }
      );
    }

    const result = await db
      .prepare("UPDATE folders SET name = ? WHERE id = ?")
      .run(name.trim(), parseInt(id, 10));

    if (result.changes === 0) {
      return NextResponse.json(
        { error: "Folder not found" },
        { status: 404 }
      );
    }

    const row = await db
      .prepare("SELECT id, name, created_at FROM folders WHERE id = ?")
      .get(parseInt(id, 10));
    return NextResponse.json(row);
  } catch (err) {
    const message = err?.message || "Failed to update folder";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const id = params?.id;
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const folderId = parseInt(id, 10);

    // Unassign threads from this folder (set folder_id to null)
    await db.prepare("UPDATE conversations SET folder_id = NULL WHERE folder_id = ?").run(folderId);

    const result = await db.prepare("DELETE FROM folders WHERE id = ?").run(folderId);

    if (result.changes === 0) {
      return NextResponse.json(
        { error: "Folder not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err?.message || "Failed to delete folder";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
