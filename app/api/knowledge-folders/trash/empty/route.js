import { NextResponse } from "next/server";
const { getSupabaseAdminClient } = require("@/lib/supabase");

export async function POST() {
  try {
    const supabase = getSupabaseAdminClient();
    const { data: deleted, error } = await supabase
      .from("knowledge_folders")
      .delete()
      .eq("is_trashed", true)
      .select("id");
    if (error) throw new Error(error.message);
    return NextResponse.json({ deleted: (deleted ?? []).length });
  } catch (err) {
    return NextResponse.json({ error: err?.message || "Failed to empty trash" }, { status: 500 });
  }
}
