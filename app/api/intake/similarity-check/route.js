const db = require("@/lib/db");

const SIMILARITY_THRESHOLD = 0.15; // cosine distance; lower = more similar

export async function POST(request) {
  try {
    const body = await request.json();
    const { rawText } = body ?? {};

    if (!rawText || typeof rawText !== "string") {
      return Response.json({ error: "rawText is required" }, { status: 400 });
    }

    const { getEmbedding } = await import("@/lib/embeddings");
    const embeddingBuffer = await getEmbedding(rawText);

    const rows = await db
      .prepare(
        `SELECT id, module, tags, raw_text, structured_data,
                vec_distance_cosine(embedding, ?) as distance
         FROM knowledge
         WHERE embedding IS NOT NULL
         ORDER BY distance
         LIMIT 1`
      )
      .all(embeddingBuffer);

    if (rows.length === 0 || rows[0].distance >= SIMILARITY_THRESHOLD) {
      return Response.json({ similar: false });
    }

    const row = rows[0];
    let structuredData;
    try {
      structuredData = JSON.parse(row.structured_data || "{}");
    } catch {
      structuredData = row.structured_data ?? "";
    }

    return Response.json({
      similar: true,
      record: {
        id: row.id,
        module: row.module,
        tags: JSON.parse(row.tags || "[]"),
        raw_text: row.raw_text,
        structured_data: structuredData,
      },
    });
  } catch (err) {
    const message = err?.message || "Similarity check failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
