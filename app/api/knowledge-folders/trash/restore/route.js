import { NextResponse } from "next/server";
const { getSupabaseAdminClient } = require("@/lib/supabase");

export async function POST(request) {
  try {
    const body = await request.json();
    let ids = body.ids ?? (body.id != null ? [body.id] : []);
    if (!Array.isArray(ids)) ids = [ids].filter((x) => x != null);
    ids = ids.map((x) => parseInt(x, 10)).filter((x) => !Number.isNaN(x));
    if (ids.length === 0) {
      return NextResponse.json({ error: "id or ids required" }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();
    const { data: allTrashed, error: fetchErr } = await supabase
      .from("knowledge_folders")
      .select("id, parent_id, depth")
      .eq("is_trashed", true);
    if (fetchErr) throw new Error(fetchErr.message);
    const allMap = new Map((allTrashed ?? []).map((f) => [f.id, f]));

    const needIds = new Set(ids);
    function addAncestors(id) {
      const row = allMap.get(id);
      if (!row || row.parent_id == null) return;
      if (allMap.has(row.parent_id)) {
        needIds.add(row.parent_id);
        addAncestors(row.parent_id);
      }
    }
    ids.forEach((id) => addAncestors(id));

    const toRestore = [...needIds]
      .map((id) => allMap.get(id))
      .filter(Boolean);
    toRestore.sort((a, b) => a.depth - b.depth);
    const restoreIds = toRestore.map((f) => f.id);
    if (restoreIds.length === 0) {
      return NextResponse.json({ error: "No trashed folders found to restore" }, { status: 404 });
    }

    const { data: updated, error: updateErr } = await supabase
      .from("knowledge_folders")
      .update({ is_trashed: false, updated_at: new Date().toISOString() })
      .in("id", restoreIds)
      .select("id, name, parent_id, depth, position, is_trashed, created_at, updated_at");
    if (updateErr) throw new Error(updateErr.message);
    return NextResponse.json(Array.isArray(updated) ? updated : [updated]);
  } catch (err) {
    return NextResponse.json({ error: err?.message || "Failed to restore" }, { status: 500 });
  }
}
