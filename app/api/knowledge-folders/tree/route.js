import { NextResponse } from "next/server";
const { getSupabaseAdminClient } = require("@/lib/supabase");

function buildTree(flat, parentId = null) {
  return flat
    .filter((f) => (f.parent_id == null && parentId === null) || f.parent_id === parentId)
    .sort((a, b) => a.position - b.position)
    .map((f) => ({
      id: f.id,
      name: f.name,
      parent_id: f.parent_id,
      depth: f.depth,
      position: f.position,
      created_at: f.created_at,
      updated_at: f.updated_at,
      children: buildTree(flat, f.id),
    }));
}

export async function GET() {
  try {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from("knowledge_folders")
      .select("id, name, parent_id, depth, position, created_at, updated_at")
      .eq("is_trashed", false)
      .order("position", { ascending: true });

    if (error) throw new Error(error.message);
    const tree = buildTree(data ?? []);
    return NextResponse.json({ tree });
  } catch (err) {
    const message = err?.message || "Failed to fetch folder tree";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
