import { NextResponse } from "next/server";
const { getSupabaseAdminClient } = require("@/lib/supabase");

const MAX_DEPTH = 6;

export async function POST(request) {
  try {
    const body = await request.json();
    const { name, parent_id: parentId } = body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();
    let depth = 0;
    let position = 0;
    let parentIdVal = null;

    if (parentId != null) {
      const pid = parseInt(parentId, 10);
      if (Number.isNaN(pid)) {
        return NextResponse.json({ error: "parent_id must be an integer" }, { status: 400 });
      }
      const { data: parent, error: parentErr } = await supabase
        .from("knowledge_folders")
        .select("id, depth")
        .eq("id", pid)
        .eq("is_trashed", false)
        .maybeSingle();
      if (parentErr) throw new Error(parentErr.message);
      if (!parent) {
        return NextResponse.json({ error: "Parent folder not found" }, { status: 404 });
      }
      depth = parent.depth + 1;
      if (depth > MAX_DEPTH) {
        return NextResponse.json({ error: "Maximum folder depth (6) exceeded" }, { status: 400 });
      }
      parentIdVal = pid;
      const { data: maxPos } = await supabase
        .from("knowledge_folders")
        .select("position")
        .eq("parent_id", pid)
        .order("position", { ascending: false })
        .limit(1)
        .maybeSingle();
      position = (maxPos?.position ?? -1) + 1;
    } else {
      const { data: maxPos } = await supabase
        .from("knowledge_folders")
        .select("position")
        .is("parent_id", null)
        .eq("is_trashed", false)
        .order("position", { ascending: false })
        .limit(1)
        .maybeSingle();
      position = (maxPos?.position ?? -1) + 1;
    }

    const { data: inserted, error } = await supabase
      .from("knowledge_folders")
      .insert({
        name: name.trim(),
        parent_id: parentIdVal,
        depth,
        position,
        is_trashed: false,
      })
      .select("id, name, parent_id, depth, position, is_trashed, created_at, updated_at")
      .single();

    if (error) throw new Error(error.message);
    return NextResponse.json(inserted, { status: 201 });
  } catch (err) {
    const message = err?.message || "Failed to create folder";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
