import { NextResponse } from "next/server";
const db = require("@/lib/db");

export async function DELETE(request, { params }) {
  try {
    const id = params?.id;
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const result = db.prepare("DELETE FROM knowledge WHERE id = ?").run(id);

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
