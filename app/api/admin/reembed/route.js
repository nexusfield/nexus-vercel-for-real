// One-time re-embed of all knowledge with Gemini (fixes "doesn't remember" after Ollama → Gemini migration).
// Run once: POST /api/admin/reembed (no body). Remove or protect in production if desired.

export async function POST() {
  try {
    const { prepare } = await import("@/lib/db");
    const { getEmbedding } = await import("@/lib/embeddings");

    const rows = await prepare(
        "SELECT id, raw_text, structured_data, module, tags, created_at FROM knowledge ORDER BY created_at DESC"
    ).all();

    if (rows.length === 0) {
      return Response.json({ reembedded: 0, message: "No knowledge rows to re-embed." });
    }

    let updated = 0;
    for (const row of rows) {
      try {
        const embeddingBuffer = await getEmbedding(row.raw_text || "");
        const now = new Date().toISOString();
        await prepare("UPDATE knowledge SET embedding = ?, updated_at = ? WHERE id = ?").run(
          embeddingBuffer,
          now,
          row.id
        );
        updated += 1;
        // Avoid Gemini rate limits
        await new Promise((r) => setTimeout(r, 200));
      } catch (err) {
        console.error(`[reembed] failed for id=${row.id}:`, err?.message);
        return Response.json(
          { error: `Re-embed failed at row ${row.id}: ${err?.message}` },
          { status: 500 }
        );
      }
    }

    return Response.json({ reembedded: updated });
  } catch (err) {
    console.error("[reembed]", err);
    return Response.json(
      { error: err?.message || "Re-embed failed" },
      { status: 500 }
    );
  }
}
