import { NextResponse } from "next/server";
const { getSupabaseAdminClient } = require("@/lib/supabase");

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
    const position = body.position;
    if (typeof position !== "number" || position < 0) {
      return NextResponse.json({ error: "position is required and must be a non-negative number" }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();
    const { data: folder, error: fetchErr } = await supabase
      .from("knowledge_folders")
      .select("id, parent_id, position")
      .eq("id", id)
      .eq("is_trashed", false)
      .maybeSingle();
    if (fetchErr) throw new Error(fetchErr.message);
    if (!folder) return NextResponse.json({ error: "Folder not found" }, { status: 404 });

    const { data: updated, error: updateErr } = await supabase
      .from("knowledge_folders")
      .update({ position, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("id, name, parent_id, depth, position, is_trashed, created_at, updated_at")
      .single();
    if (updateErr) throw new Error(updateErr.message);
    return NextResponse.json(updated);
  } catch (err) {
    return NextResponse.json({ error: err?.message || "Failed to reorder folder" }, { status: 500 });
  }
}
