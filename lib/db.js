const { getSupabaseClient } = require("./supabase");
const { bufferToVectorLiteral } = require("./vector");

let _lastInsertRowId = null;

function normalizeSql(sql) {
  return sql.replace(/\s+/g, " ").trim().toLowerCase();
}

function ensureSupabase() {
  return getSupabaseClient();
}

function parseUpdateAssignments(sql) {
  const match = sql.match(/update\s+\w+\s+set\s+(.+)\s+where\s+/i);
  if (!match) return [];
  return match[1].split(",").map((part) => part.trim());
}

function parseUpdatePayload(assignments, params) {
  const payload = {};
  let paramIndex = 0;
  for (const assignment of assignments) {
    const [columnRaw, valueRaw] = assignment.split("=").map((s) => s.trim());
    const column = columnRaw.replace(/"/g, "");
    const value = (valueRaw || "").toLowerCase();
    if (value === "current_timestamp") {
      payload[column] = new Date().toISOString();
      continue;
    }
    payload[column] = params[paramIndex];
    paramIndex += 1;
  }
  return payload;
}

async function runMapped(sql, params, mode) {
  const supabase = ensureSupabase();
  const normalized = normalizeSql(sql);

  if (normalized === "select last_insert_rowid() as id") {
    const row = { id: _lastInsertRowId };
    return mode === "all" ? [row] : row;
  }

  if (
    normalized.includes("from conversations") &&
    normalized.includes("name") &&
    normalized.includes("created_at") &&
    normalized.includes("updated_at") &&
    normalized.includes("messages") &&
    /order by (c\.)?updated_at desc/.test(normalized)
  ) {
    let query = supabase
      .from("conversations")
      .select("id, name, created_at, updated_at, messages, folder_id")
      .order("updated_at", { ascending: false });

    if (normalized.includes("where c.id in")) {
      const q = params[0] ?? "";
      query = query.or(`name.ilike.%${q}%,messages.ilike.%${q}%`);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    return mode === "get" ? rows[0] : rows;
  }

  if (normalized === "insert into conversations (name) values ('new chat')") {
    const { data, error } = await supabase
      .from("conversations")
      .insert({ name: "New Chat" })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    _lastInsertRowId = data.id;
    return { changes: 1 };
  }

  if (normalized.startsWith("update conversations set")) {
    const conversationId = params[params.length - 1];
    const assignments = parseUpdateAssignments(sql);
    const payload = parseUpdatePayload(assignments, params.slice(0, -1));
    const { data, error } = await supabase
      .from("conversations")
      .update(payload)
      .eq("id", conversationId)
      .select("id");
    if (error) throw new Error(error.message);
    return { changes: data?.length ?? 0 };
  }

  if (
    normalized.startsWith("select id, name, created_at, updated_at, messages from conversations where id = ?") ||
    normalized.startsWith("select id, name, created_at, updated_at, messages, folder_id from conversations where id = ?")
  ) {
    const { data, error } = await supabase
      .from("conversations")
      .select("id, name, created_at, updated_at, messages, folder_id")
      .eq("id", params[0])
      .maybeSingle();
    if (error) throw new Error(error.message);
    return mode === "all" ? (data ? [data] : []) : data ?? undefined;
  }

  if (normalized.startsWith("select id from conversations where id = ?")) {
    const { data, error } = await supabase
      .from("conversations")
      .select("id")
      .eq("id", params[0])
      .maybeSingle();
    if (error) throw new Error(error.message);
    return mode === "all" ? (data ? [data] : []) : data ?? undefined;
  }

  if (normalized.startsWith("delete from conversations where id = ?")) {
    const { data, error } = await supabase
      .from("conversations")
      .delete()
      .eq("id", params[0])
      .select("id");
    if (error) throw new Error(error.message);
    return { changes: data?.length ?? 0 };
  }

  if (
    normalized.startsWith("select id, raw_text, structured_data, module, tags, created_at from knowledge")
  ) {
    const { data, error } = await supabase
      .from("knowledge")
      .select("id, raw_text, structured_data, module, tags, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    return mode === "get" ? rows[0] : rows;
  }

  if (normalized.startsWith("select id, structured_data, raw_text, module, tags, created_at, updated_at from knowledge where id = ?")) {
    const { data, error } = await supabase
      .from("knowledge")
      .select("id, structured_data, raw_text, module, tags, created_at, updated_at")
      .eq("id", params[0])
      .maybeSingle();
    if (error) throw new Error(error.message);
    return mode === "all" ? (data ? [data] : []) : data ?? undefined;
  }

  if (normalized.startsWith("delete from knowledge where id = ?")) {
    const { data, error } = await supabase
      .from("knowledge")
      .delete()
      .eq("id", params[0])
      .select("id");
    if (error) throw new Error(error.message);
    return { changes: data?.length ?? 0 };
  }

  if (normalized.startsWith("select entity_links from knowledge where id = ?")) {
    const { data, error } = await supabase
      .from("knowledge")
      .select("entity_links")
      .eq("id", params[0])
      .maybeSingle();
    if (error) throw new Error(error.message);
    return mode === "all" ? (data ? [data] : []) : data ?? undefined;
  }

  if (normalized.startsWith("update knowledge set entity_links = ?, updated_at = ? where id = ?")) {
    const { data, error } = await supabase
      .from("knowledge")
      .update({ entity_links: params[0], updated_at: params[1] })
      .eq("id", params[2])
      .select("id");
    if (error) throw new Error(error.message);
    return { changes: data?.length ?? 0 };
  }

  if (normalized.startsWith("insert into knowledge")) {
    const vector = bufferToVectorLiteral(params[7]);
    const payload = {
      id: params[0],
      module: params[1],
      entity_links: params[2],
      tags: params[3],
      source: params[4],
      created_at: params[5],
      updated_at: params[6],
      embedding: vector,
      raw_text: params[8],
      structured_data: params[9],
    };
    const { error } = await supabase.from("knowledge").insert(payload);
    if (error) throw new Error(error.message);
    return { changes: 1 };
  }

  if (normalized.startsWith("update knowledge set")) {
    const knowledgeId = params[params.length - 1];
    const assignments = parseUpdateAssignments(sql);
    const payload = parseUpdatePayload(assignments, params.slice(0, -1));
    if (Object.prototype.hasOwnProperty.call(payload, "embedding")) {
      payload.embedding = bufferToVectorLiteral(payload.embedding);
    }
    const { data, error } = await supabase
      .from("knowledge")
      .update(payload)
      .eq("id", knowledgeId)
      .select("id");
    if (error) throw new Error(error.message);
    return { changes: data?.length ?? 0 };
  }

  if (normalized.includes("vec_distance_cosine(embedding, ?) as distance") && normalized.includes("limit 1")) {
    const { data, error } = await supabase.rpc("find_most_similar_knowledge", {
      query_embedding: bufferToVectorLiteral(params[0]),
    });
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    return mode === "get" ? rows[0] : rows;
  }

  if (normalized.includes("order by vec_distance_cosine(embedding, ?)") && normalized.includes("limit 15")) {
    const { data, error } = await supabase.rpc("search_knowledge_by_embedding", {
      query_embedding: bufferToVectorLiteral(params[0]),
      match_count: 15,
    });
    if (error) throw new Error(error.message);
    const rows = (data ?? []).map((row) => ({
      id: row.id,
      module: row.module,
      tags: row.tags,
      raw_text: row.raw_text,
      structured_data: row.structured_data,
    }));
    return mode === "get" ? rows[0] : rows;
  }

  if (normalized === "select count(*) as n from knowledge") {
    const { count, error } = await supabase
      .from("knowledge")
      .select("id", { count: "exact", head: true });
    if (error) throw new Error(error.message);
    const row = { n: count ?? 0 };
    return mode === "all" ? [row] : row;
  }

  if (normalized === "select count(*) as n from knowledge where embedding is not null") {
    const { count, error } = await supabase
      .from("knowledge")
      .select("id", { count: "exact", head: true })
      .not("embedding", "is", null);
    if (error) throw new Error(error.message);
    const row = { n: count ?? 0 };
    return mode === "all" ? [row] : row;
  }

  if (normalized.includes("select id, module, substr(raw_text, 1, 120) as raw_preview, length(raw_text) as len")) {
    const { data, error } = await supabase
      .from("knowledge")
      .select("id, module, raw_text")
      .order("created_at", { ascending: false })
      .limit(10);
    if (error) throw new Error(error.message);
    const rows = (data ?? []).map((row) => ({
      id: row.id,
      module: row.module,
      raw_preview: (row.raw_text || "").slice(0, 120),
      len: (row.raw_text || "").length,
    }));
    return mode === "get" ? rows[0] : rows;
  }

  if (
    normalized ===
    "select id, name, trigger_phrase, instruction, created_at from modes order by created_at desc"
  ) {
    const { data, error } = await supabase
      .from("modes")
      .select("id, name, trigger_phrase, instruction, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    return mode === "get" ? rows[0] : rows;
  }

  if (normalized.startsWith("insert into modes (name, trigger_phrase, instruction) values (?, ?, ?)")) {
    const { data, error } = await supabase
      .from("modes")
      .insert({
        name: params[0],
        trigger_phrase: params[1],
        instruction: params[2],
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    _lastInsertRowId = data.id;
    return { changes: 1 };
  }

  if (
    normalized === "select id, name, trigger_phrase, instruction, created_at from modes where id = ?"
  ) {
    const { data, error } = await supabase
      .from("modes")
      .select("id, name, trigger_phrase, instruction, created_at")
      .eq("id", params[0])
      .maybeSingle();
    if (error) throw new Error(error.message);
    return mode === "all" ? (data ? [data] : []) : data ?? undefined;
  }

  if (normalized.startsWith("update modes set")) {
    const modeId = params[params.length - 1];
    const assignments = parseUpdateAssignments(sql);
    const payload = parseUpdatePayload(assignments, params.slice(0, -1));
    const { data, error } = await supabase
      .from("modes")
      .update(payload)
      .eq("id", modeId)
      .select("id");
    if (error) throw new Error(error.message);
    return { changes: data?.length ?? 0 };
  }

  if (normalized === "delete from modes where id = ?") {
    const { data, error } = await supabase
      .from("modes")
      .delete()
      .eq("id", params[0])
      .select("id");
    if (error) throw new Error(error.message);
    return { changes: data?.length ?? 0 };
  }

  if (normalized === "select id, name, created_at from folders order by created_at asc") {
    const { data, error } = await supabase
      .from("folders")
      .select("id, name, created_at")
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    return mode === "get" ? rows[0] : rows;
  }

  if (normalized.startsWith("insert into folders (name) values (?)")) {
    const { data, error } = await supabase
      .from("folders")
      .insert({ name: params[0] })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    _lastInsertRowId = data.id;
    return { changes: 1 };
  }

  if (normalized.startsWith("select id, name, created_at from folders where id = ?")) {
    const { data, error } = await supabase
      .from("folders")
      .select("id, name, created_at")
      .eq("id", params[0])
      .maybeSingle();
    if (error) throw new Error(error.message);
    return mode === "all" ? (data ? [data] : []) : data ?? undefined;
  }

  if (normalized.startsWith("update folders set name = ? where id = ?")) {
    const { data, error } = await supabase
      .from("folders")
      .update({ name: params[0] })
      .eq("id", params[1])
      .select("id");
    if (error) throw new Error(error.message);
    return { changes: data?.length ?? 0 };
  }

  if (normalized.startsWith("update conversations set folder_id = null where folder_id = ?")) {
    const { data, error } = await supabase
      .from("conversations")
      .update({ folder_id: null })
      .eq("folder_id", params[0])
      .select("id");
    if (error) throw new Error(error.message);
    return { changes: data?.length ?? 0 };
  }

  if (normalized === "delete from folders where id = ?") {
    const { data, error } = await supabase
      .from("folders")
      .delete()
      .eq("id", params[0])
      .select("id");
    if (error) throw new Error(error.message);
    return { changes: data?.length ?? 0 };
  }

  throw new Error(`Unsupported SQL in Supabase adapter: ${sql}`);
}

function prepare(sql) {
  return {
    all: async (...params) => {
      const result = await runMapped(sql, params, "all");
      return Array.isArray(result) ? result : result ? [result] : [];
    },
    get: async (...params) => {
      const result = await runMapped(sql, params, "get");
      return Array.isArray(result) ? result[0] : result;
    },
    run: async (...params) => {
      const result = await runMapped(sql, params, "run");
      return result ?? { changes: 0 };
    },
  };
}

module.exports = { prepare };
