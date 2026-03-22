import { NextResponse } from "next/server";
const { getSupabaseAdminClient } = require("@/lib/supabase");

export async function GET() {
  try {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from("knowledge_folders")
      .select("id, name, parent_id, depth, position, created_at, updated_at")
      .eq("is_trashed", true)
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return NextResponse.json({ items: data ?? [] });
  } catch (err) {
    return NextResponse.json({ error: err?.message || "Failed to fetch trash" }, { status: 500 });
  }
}
