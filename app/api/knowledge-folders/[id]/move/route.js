import { NextResponse } from "next/server";
const { getSupabaseAdminClient } = require("@/lib/supabase");

const MAX_DEPTH = 6;

async function resolveId(context) {
  const params = context?.params;
  const id = typeof params?.then === "function" ? (await params).id : params?.id;
  if (!id) return { id: null, error: NextResponse.json({ error: "id is required" }, { status: 400 }) };
  const numId = parseInt(id, 10);
  if (Number.isNaN(numId)) return { id: null, error: NextResponse.json({ error: "Invalid id" }, { status: 400 }) };
  return { id: numId };
}

export async function PATCH(request, context) {
  try {
    const { id, error } = await resolveId(context);
    if (error) return error;
    const body = await request.json();
    const parentId = body.parent_id;

    const supabase = getSupabaseAdminClient();

    const { data: folder, error: fetchErr } = await supabase
      .from("knowledge_folders")
      .select("id, parent_id, depth")
      .eq("id", id)
      .eq("is_trashed", false)
      .maybeSingle();
    if (fetchErr) throw new Error(fetchErr.message);
    if (!folder) return NextResponse.json({ error: "Folder not found" }, { status: 404 });

    let newDepth = 0;
    let newParentId = null;
    if (parentId != null && parentId !== "") {
      const pid = parseInt(parentId, 10);
      if (Number.isNaN(pid)) {
        return NextResponse.json({ error: "parent_id must be an integer" }, { status: 400 });
      }
      if (pid === id) {
        return NextResponse.json({ error: "Folder cannot be its own parent" }, { status: 400 });
      }
      const { data: parent, error: parentErr } = await supabase
        .from("knowledge_folders")
        .select("id, depth")
        .eq("id", pid)
        .eq("is_trashed", false)
        .maybeSingle();
      if (parentErr) throw new Error(parentErr.message);
      if (!parent) return NextResponse.json({ error: "Target parent folder not found" }, { status: 404 });
      newDepth = parent.depth + 1;
      if (newDepth > MAX_DEPTH) {
        return NextResponse.json({ error: "Maximum folder depth (6) exceeded" }, { status: 400 });
      }
      newParentId = pid;
    }

    const targetParentId = newParentId;
    const posQuery = supabase
      .from("knowledge_folders")
      .select("position")
      .eq("is_trashed", false)
      .order("position", { ascending: false })
      .limit(1);
    if (targetParentId == null) {
      posQuery.is("parent_id", null);
    } else {
      posQuery.eq("parent_id", targetParentId);
    }
    const { data: maxPos } = await posQuery.maybeSingle();
    const newPosition = (maxPos?.position ?? -1) + 1;

    const { data: updated, error: updateErr } = await supabase
      .from("knowledge_folders")
      .update({
        parent_id: targetParentId,
        depth: newDepth,
        position: newPosition,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("id, name, parent_id, depth, position, is_trashed, created_at, updated_at")
      .single();
    if (updateErr) throw new Error(updateErr.message);
    return NextResponse.json(updated);
  } catch (err) {
    return NextResponse.json({ error: err?.message || "Failed to move folder" }, { status: 500 });
  }
}
