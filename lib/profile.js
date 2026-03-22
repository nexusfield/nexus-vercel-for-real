const { randomUUID } = require("crypto");
const { getSupabaseClient } = require("./supabase");

const VALID_CONFIDENCE = new Set(["emerging", "established", "foundational"]);

const SEED_FACETS = [
  {
    category: "identity",
    content:
      "Ladnon is building Nexus, a personal intelligence system designed as a local-first AI assistant transitioning to cloud-hosted deployment.",
    confidence: "foundational",
    source: "manual",
  },
  {
    category: "identity",
    content:
      "Core tech stack: Next.js, Supabase with pgvector, Claude APIs, Vercel deployment.",
    confidence: "established",
    source: "manual",
  },
  {
    category: "communication",
    content:
      "Prefers direct, specific answers. Does not want to repeat context that has been previously established.",
    confidence: "foundational",
    source: "manual",
  },
  {
    category: "communication",
    content:
      "Values first-principles reasoning and probing questions when seeking to understand something.",
    confidence: "foundational",
    source: "manual",
  },
  {
    category: "communication",
    content:
      "Wants NEXUS to hold and apply project context proactively - clarifying questions about already-established context are a friction point.",
    confidence: "foundational",
    source: "manual",
  },
  {
    category: "thinking_style",
    content:
      "Thinks architecturally. Uses Claude to stress-test decisions and surface gaps before implementation.",
    confidence: "established",
    source: "manual",
  },
  {
    category: "thinking_style",
    content:
      "Development proceeds via incremental Cursor prompts, each scoped to a specific feature or architectural change.",
    confidence: "established",
    source: "manual",
  },
  {
    category: "working_on",
    content:
      "Currently focused on making the chat agent system prompt progressive and personalized - reflecting who the user is.",
    confidence: "established",
    source: "manual",
  },
  {
    category: "working_on",
    content:
      "Prompt 3 (mode-aware navigation) is pending - adding mode-based filtering to knowledge retrieval.",
    confidence: "established",
    source: "manual",
  },
  {
    category: "priorities",
    content:
      "Memory architecture is the core focus - better retrieval, mode-aware navigation, and eventually profile-driven personalization.",
    confidence: "established",
    source: "manual",
  },
  {
    category: "priorities",
    content:
      "Product-level directions (consumer vision, pricing, agentic expansion) are explicitly scoped out as premature.",
    confidence: "established",
    source: "manual",
  },
];

function normalizeConfidence(value) {
  const candidate = String(value || "established").trim().toLowerCase();
  return VALID_CONFIDENCE.has(candidate) ? candidate : "established";
}

function titleCaseCategory(rawCategory) {
  const category = String(rawCategory || "").replace(/[_-]+/g, " ").trim();
  if (!category) return "";
  return category
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

async function ensureSeedProfile(userId) {
  const supabase = getSupabaseClient();
  const { count, error: countError } = await supabase
    .from("user_profile")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (countError) throw new Error(countError.message);
  if ((count || 0) > 0) return;

  const now = new Date().toISOString();
  const rows = SEED_FACETS.map((facet, index) => ({
    id: randomUUID(),
    user_id: userId,
    category: facet.category,
    content: facet.content,
    confidence: normalizeConfidence(facet.confidence),
    source: facet.source || "manual",
    created_at: new Date(Date.now() + index).toISOString(),
    updated_at: now,
    active: true,
  }));
  const { error: insertError } = await supabase.from("user_profile").insert(rows);
  if (insertError) throw new Error(insertError.message);
}

async function getActiveProfile(userId) {
  await ensureSeedProfile(userId);
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("user_profile")
    .select("*")
    .eq("user_id", userId)
    .eq("active", true)
    .order("category", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return data || [];
}

async function createProfileFacet(userId, payload) {
  const supabase = getSupabaseClient();
  const now = new Date().toISOString();
  const row = {
    id: randomUUID(),
    user_id: userId,
    category: String(payload?.category || "").trim(),
    content: String(payload?.content || "").trim(),
    confidence: normalizeConfidence(payload?.confidence),
    source: String(payload?.source || "manual").trim() || "manual",
    created_at: now,
    updated_at: now,
    active: true,
  };
  const { data, error } = await supabase
    .from("user_profile")
    .insert(row)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

async function updateProfileFacet(userId, id, updates) {
  const supabase = getSupabaseClient();
  const payload = {};
  if (updates.category !== undefined) payload.category = String(updates.category || "").trim();
  if (updates.content !== undefined) payload.content = String(updates.content || "").trim();
  if (updates.confidence !== undefined) payload.confidence = normalizeConfidence(updates.confidence);
  if (updates.active !== undefined) payload.active = Boolean(updates.active);
  payload.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("user_profile")
    .update(payload)
    .eq("id", id)
    .eq("user_id", userId)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

async function deactivateProfileFacet(userId, id) {
  const supabase = getSupabaseClient();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("user_profile")
    .update({ active: false, updated_at: now })
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

async function assembleProfileBlock(userId) {
  const facets = await getActiveProfile(userId);
  if (!facets.length) return "";

  const grouped = new Map();
  for (const facet of facets) {
    const category = String(facet.category || "").trim();
    if (!category) continue;
    if (!grouped.has(category)) grouped.set(category, []);
    grouped.get(category).push(String(facet.content || "").trim());
  }

  if (grouped.size === 0) return "";

  const lines = [
    "--- User Profile ---",
    "You are NEXUS, a personal intelligence system built for and by this specific user. The following describes who they are, how they think, and what matters to them. Use this to inform your tone, depth, priorities, and approach in every response.",
    "",
  ];

  for (const [category, entries] of grouped.entries()) {
    lines.push(`[${titleCaseCategory(category)}]`);
    for (const content of entries) {
      if (content) lines.push(`- ${content}`);
    }
    lines.push("");
  }

  lines.push(
    "Do not reference this profile explicitly in responses unless the user asks about it. Let it shape how you respond, not what you say about yourself."
  );
  lines.push("---");

  return lines.join("\n");
}

module.exports = {
  getActiveProfile,
  createProfileFacet,
  updateProfileFacet,
  deactivateProfileFacet,
  assembleProfileBlock,
};
