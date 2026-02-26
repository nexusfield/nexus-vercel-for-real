const db = require("./db");
const { getEmbedding } = require("./embeddings");

async function runNavigationAgent(query) {
  // Step 1: Generate embedding for the query via Ollama (nomic-embed-text, 768 dimensions)
  const embeddingBuffer = await getEmbedding(query);

  // Step 2: Search knowledge table using sqlite-vec cosine similarity
  const rows = db
    .prepare(
      `SELECT id, module, tags, raw_text, structured_data
       FROM knowledge
       WHERE embedding IS NOT NULL
       ORDER BY vec_distance_cosine(embedding, ?)
       LIMIT 5`
    )
    .all(embeddingBuffer);

  return rows.map((row) => {
    let structuredData;
    try {
      structuredData = JSON.parse(row.structured_data || "{}");
    } catch {
      structuredData = row.structured_data ?? "";
    }
    return {
      id: row.id,
      module: row.module,
      tags: JSON.parse(row.tags || "[]"),
      raw_text: row.raw_text,
      structured_data: structuredData,
    };
  });
}

module.exports = { runNavigationAgent };
