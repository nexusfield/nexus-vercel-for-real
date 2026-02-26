// GET /api/debug/knowledge — verify dump content is in DB (remove in production)
export async function GET() {
  try {
    const dbMod = await import("@/lib/db");
    const db = dbMod.default ?? dbMod;
    const count = db.prepare("SELECT COUNT(*) as n FROM knowledge").get();
    const withEmbedding = db.prepare(
      "SELECT COUNT(*) as n FROM knowledge WHERE embedding IS NOT NULL"
    ).get();
    const sample = db
      .prepare(
        `SELECT id, module, substr(raw_text, 1, 120) as raw_preview, length(raw_text) as len
         FROM knowledge
         ORDER BY created_at DESC
         LIMIT 10`
      )
      .all();

    return Response.json({
      totalRows: count.n,
      rowsWithEmbedding: withEmbedding.n,
      sample: sample.map((r) => ({
        id: r.id,
        module: r.module,
        raw_preview: r.raw_preview + (r.len > 120 ? "..." : ""),
        len: r.len,
      })),
    });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
