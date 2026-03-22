import { NextResponse } from "next/server";
const { getSupabaseAdminClient } = require("@/lib/supabase");

async function resolveId(context) {
  const params = context?.params;
  const id = typeof params?.then === "function" ? (await params)?.id : params?.id;
  if (!id) return { id: null, error: NextResponse.json({ error: "id is required" }, { status: 400 }) };
  const numId = parseInt(id, 10);
  if (Number.isNaN(numId)) return { id: null, error: NextResponse.json({ error: "Invalid id" }, { status: 400 }) };
  return { id: numId };
}

export async function GET(request, context) {
  try {
    const { id, error } = await resolveId(context);
    if (error) return error;
    const supabase = getSupabaseAdminClient();
    const { data, error: fetchErr } = await supabase
      .from("knowledge_folders")
      .select("id, name, parent_id, depth, position, is_trashed, created_at, updated_at")
      .eq("id", id)
      .maybeSingle();
    if (fetchErr) throw new Error(fetchErr.message);
    if (!data) return NextResponse.json({ error: "Folder not found" }, { status: 404 });
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: err?.message || "Failed to fetch folder" }, { status: 500 });
  }
}

export async function PATCH(request, context) {
  try {
    const { id, error } = await resolveId(context);
    if (error) return error;
    const body = await request.json();
    const { name } = body;
    if (name === undefined || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "name is required and must be non-empty" }, { status: 400 });
    }
    const supabase = getSupabaseAdminClient();
    const { data, error: updateErr } = await supabase
      .from("knowledge_folders")
      .update({ name: name.trim(), updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("id, name, parent_id, depth, position, is_trashed, created_at, updated_at")
      .single();
    if (updateErr) throw new Error(updateErr.message);
    if (!data) return NextResponse.json({ error: "Folder not found" }, { status: 404 });
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: err?.message || "Failed to update folder" }, { status: 500 });
  }
}

export async function DELETE(request, context) {
  try {
    const { id, error } = await resolveId(context);
    if (error) return error;
    const supabase = getSupabaseAdminClient();
    const { error: rpcErr } = await supabase.rpc("trash_knowledge_folder_and_descendants", { target_id: id });
    if (rpcErr) throw new Error(rpcErr.message);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err?.message || "Failed to trash folder" }, { status: 500 });
  }
}
