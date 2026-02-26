const OLLAMA_EMBED_URL = "http://localhost:11434/api/embeddings";
const EMBEDDING_MODEL = "nomic-embed-text";
const EMBEDDING_DIMENSIONS = 768;

async function getEmbedding(text) {
  const res = await fetch(OLLAMA_EMBED_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: EMBEDDING_MODEL, prompt: text }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Ollama embedding failed: ${res.status} ${errText}`);
  }

  const data = await res.json();
  const embedding = data.embedding;

  if (!Array.isArray(embedding)) {
    throw new Error("Ollama did not return an embedding array");
  }

  const buffer = Buffer.from(new Float32Array(embedding).buffer);
  return buffer;
}

module.exports = { getEmbedding, EMBEDDING_DIMENSIONS };
