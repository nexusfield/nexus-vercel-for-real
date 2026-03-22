const { getEnv } = require("./getEnv");

const GEMINI_EMBED_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent";
const EMBEDDING_MODEL = "models/gemini-embedding-001";
const EMBEDDING_DIMENSIONS = 768;

async function getEmbedding(text) {
  // Read at call time so env is correct in API routes (Next.js may not load .env for routes)
  const apiKey = getEnv("GEMINI_API_KEY");
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is missing. Add it to .env.local and restart the dev server.");
  }

  const res = await fetch(`${GEMINI_EMBED_URL}?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      content: {
        parts: [{ text: String(text || "") }],
      },
      outputDimensionality: EMBEDDING_DIMENSIONS,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini embedding failed: ${res.status} ${errText}`);
  }

  const data = await res.json();
  const embedding = data?.embedding?.values;

  if (!Array.isArray(embedding)) {
    throw new Error("Gemini did not return an embedding array");
  }
  if (embedding.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(`Gemini embedding length mismatch: expected ${EMBEDDING_DIMENSIONS}, got ${embedding.length}`);
  }

  const buffer = Buffer.from(new Float32Array(embedding).buffer);
  return buffer;
}

module.exports = { getEmbedding, EMBEDDING_DIMENSIONS };
