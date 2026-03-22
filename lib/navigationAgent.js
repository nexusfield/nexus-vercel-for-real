const db = require("./db");
const { getEmbedding } = require("./embeddings");

const MEMORY_INTROSPECTION_PATTERNS = [
  /\bwhat\b.*\b(memory|remember|context)\b/i,
  /\bwhat do you (have|know)\b/i,
  /\bmemory\b.*\bbase\b/i,
  /\bknowledge\b.*\bbase\b/i,
];

const DEV_PROMPT_PATTERNS = [
  /\bnexus\b.*\b(prompt|dev|development)\b/i,
  /\bsystem prompt\b/i,
  /\brules of engagement\b/i,
  /\bmandatory first step\b/i,
];

const DEV_PROMPT_HINTS = [
  "nexus",
  "prompt",
  "development",
  "dev",
  "rules of engagement",
  "mandatory first step",
  "context.md",
];

function parseJsonArray(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseStructuredData(value) {
  try {
    return JSON.parse(value || "{}");
  } catch {
    return value ?? "";
  }
}

function getUnitId(tags) {
  const unitTag = (tags || []).find((tag) => String(tag).startsWith("unit:"));
  return unitTag ? String(unitTag).slice(5) : "";
}

function getPartIndex(tags) {
  const partTag = (tags || []).find((tag) => String(tag).startsWith("part:"));
  if (!partTag) return Number.MAX_SAFE_INTEGER;
  const raw = String(partTag).slice(5).split("/")[0];
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

function getPartCount(tags) {
  const partTag = (tags || []).find((tag) => String(tag).startsWith("part:"));
  if (!partTag) return 0;
  const rawTotal = String(partTag).slice(5).split("/")[1];
  const parsed = Number.parseInt(rawTotal, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeRow(row) {
  const tags = parseJsonArray(row.tags);
  const searchText = [
    row.raw_text || "",
    row.structured_data || "",
    tags.join(" "),
  ]
    .join(" ")
    .toLowerCase();
  return {
    id: row.id,
    module: row.module,
    tags,
    raw_text: row.raw_text,
    structured_data: parseStructuredData(row.structured_data),
    _searchText: searchText,
    _unitId: getUnitId(tags),
    _partIndex: getPartIndex(tags),
    _partCount: getPartCount(tags),
    _createdAt: row.created_at || "",
  };
}

function matchesAnyPattern(query, patterns) {
  return patterns.some((pattern) => pattern.test(query));
}

function buildUnitExpandedRows(rows, unitIds) {
  if (unitIds.size === 0) return [];
  return rows
    .filter((row) => unitIds.has(row._unitId))
    .sort((a, b) => {
      if (a._unitId !== b._unitId) return a._unitId.localeCompare(b._unitId);
      return a._partIndex - b._partIndex;
    });
}

function getTopUnitIdsByHints(rows, hints, limit = 3) {
  const unitScores = new Map();
  for (const row of rows) {
    if (!row._unitId) continue;
    let score = 0;
    for (const hint of hints) {
      if (row._searchText.includes(hint)) score += 1;
    }
    if (score > 0) {
      const current = unitScores.get(row._unitId) || 0;
      unitScores.set(row._unitId, Math.max(current, score));
    }
  }
  return Array.from(unitScores.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([unitId]) => unitId);
}

function getMostRecentUnitIds(rows, limit = 3) {
  const seen = new Set();
  const result = [];
  for (const row of rows) {
    if (!row._unitId || seen.has(row._unitId)) continue;
    seen.add(row._unitId);
    result.push(row._unitId);
    if (result.length >= limit) break;
  }
  return result;
}

function stripInternalFields(rows) {
  return rows.map(
    ({
      _unitId,
      _partIndex,
      _partCount,
      _searchText,
      _createdAt,
      ...publicRow
    }) => publicRow
  );
}

async function runNavigationAgent(query) {
  const queryText = String(query || "");
  const isMemoryIntrospection = matchesAnyPattern(
    queryText,
    MEMORY_INTROSPECTION_PATTERNS
  );
  const isDevPromptLookup = matchesAnyPattern(queryText, DEV_PROMPT_PATTERNS);

  // Step 1: Generate embedding for the query via Gemini (text-embedding-004, 768 dimensions)
  const embeddingBuffer = await getEmbedding(query);

  // Step 2: Search knowledge table using the db adapter's vector similarity mapping
  let rows = await db
    .prepare(
      `SELECT id, module, tags, raw_text, structured_data
       FROM knowledge
       WHERE embedding IS NOT NULL
       ORDER BY vec_distance_cosine(embedding, ?)
        LIMIT 15`
    )
    .all(embeddingBuffer);

  // If vector search returns nothing (e.g. RLS, no embeddings, or RPC format), use recent rows so chat still has context
  if (rows.length === 0) {
    const allRows = await db
      .prepare(
        `SELECT id, raw_text, structured_data, module, tags, created_at
         FROM knowledge
         ORDER BY created_at DESC`
      )
      .all();
    rows = allRows.slice(0, 15).map((r) => ({
      id: r.id,
      module: r.module,
      tags: r.tags,
      raw_text: r.raw_text,
      structured_data: r.structured_data,
    }));
  }

  const primary = rows.map(normalizeRow);

  const incompleteUnitIds = new Set();
  const multiPartMeta = new Map();

  for (const row of primary) {
    if (!row._unitId || !Number.isFinite(row._partIndex)) continue;
    const unitId = row._unitId;
    const partIndex = row._partIndex;
    const partCount = row._partCount || 0;
    let meta = multiPartMeta.get(unitId);
    if (!meta) {
      meta = { partCount, partsPresent: new Set() };
      multiPartMeta.set(unitId, meta);
    } else if (partCount > meta.partCount) {
      meta.partCount = partCount;
    }
    meta.partsPresent.add(partIndex);
  }

  for (const [unitId, meta] of multiPartMeta.entries()) {
    if (meta.partCount > 1 && meta.partsPresent.size < meta.partCount) {
      incompleteUnitIds.add(unitId);
    }
  }

  const shouldLoadAllRows =
    isMemoryIntrospection || isDevPromptLookup || incompleteUnitIds.size > 0;
  let allNormalized = [];
  if (shouldLoadAllRows) {
    const allRows = await db
      .prepare(
        `SELECT id, raw_text, structured_data, module, tags, created_at
         FROM knowledge
         ORDER BY created_at DESC`
      )
      .all();
    allNormalized = allRows.map(normalizeRow);
  }

  let siblings = [];
  if (allNormalized.length > 0) {
    const siblingUnitIds = new Set();
    for (const unitId of incompleteUnitIds) {
      siblingUnitIds.add(unitId);
    }
    if (isMemoryIntrospection || isDevPromptLookup) {
      for (const row of primary) {
        if (row._unitId) siblingUnitIds.add(row._unitId);
      }
    }
    if (siblingUnitIds.size > 0) {
      siblings = buildUnitExpandedRows(allNormalized, siblingUnitIds);
    }
  }

  let fallback = [];
  if (isDevPromptLookup && allNormalized.length > 0) {
    const hintedUnitIds = getTopUnitIdsByHints(allNormalized, DEV_PROMPT_HINTS, 3);
    fallback = buildUnitExpandedRows(allNormalized, new Set(hintedUnitIds));
  } else if (isMemoryIntrospection && allNormalized.length > 0) {
    const recentUnitIds = getMostRecentUnitIds(allNormalized, 3);
    fallback = buildUnitExpandedRows(allNormalized, new Set(recentUnitIds));
  }

  const merged = new Map();
  for (const row of primary) merged.set(row.id, row);
  for (const row of siblings) {
    if (!merged.has(row.id)) merged.set(row.id, row);
  }
  for (const row of fallback) {
    if (!merged.has(row.id)) merged.set(row.id, row);
  }

  return stripInternalFields(Array.from(merged.values()));
}

module.exports = { runNavigationAgent };
