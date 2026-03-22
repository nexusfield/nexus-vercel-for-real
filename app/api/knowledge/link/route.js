import { NextResponse } from "next/server";
const db = require("@/lib/db");

export async function POST(request) {
  try {
    const body = await request.json();
    const { ids } = body ?? {};

    if (!Array.isArray(ids) || ids.length < 2) {
      return NextResponse.json(
        { error: "ids must be an array of at least 2 record ids" },
        { status: 400 }
      );
    }

    const uniqueIds = [...new Set(ids)].filter((id) => id && typeof id === "string");
    if (uniqueIds.length < 2) {
      return NextResponse.json(
        { error: "At least 2 valid ids required" },
        { status: 400 }
      );
    }

    for (const id of uniqueIds) {
      const row = await db.prepare("SELECT entity_links FROM knowledge WHERE id = ?").get(id);
      if (!row) {
        return NextResponse.json(
          { error: `Knowledge record not found: ${id}` },
          { status: 404 }
        );
      }

      let currentLinks = [];
      try {
        currentLinks = JSON.parse(row.entity_links || "[]");
      } catch {
        currentLinks = [];
      }

      const otherIds = uniqueIds.filter((o) => o !== id);
      const merged = [...new Set([...currentLinks, ...otherIds])];

      await db.prepare("UPDATE knowledge SET entity_links = ?, updated_at = ? WHERE id = ?").run(
        JSON.stringify(merged),
        new Date().toISOString(),
        id
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err?.message || "Link failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
