import { NextResponse } from "next/server";

// POST /api/profile/consolidate
// Body: { since?: string, dryRun?: boolean }
// Future: calls runConsolidation and returns proposals
export async function POST() {
  return NextResponse.json(
    {
      error: "Profile consolidation is not implemented yet.",
      success: false,
    },
    { status: 501 }
  );
}
