import { NextResponse } from "next/server";
import { auth } from "@/auth";

const {
  getActiveProfile,
  createProfileFacet,
} = require("@/lib/profile");

function getUserId(session) {
  return session?.user?.email || session?.user?.id || "";
}

export async function GET() {
  try {
    const session = await auth();
    const userId = getUserId(session);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rows = await getActiveProfile(userId);
    return NextResponse.json(rows);
  } catch (err) {
    const message = err?.message || "Failed to fetch profile";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const session = await auth();
    const userId = getUserId(session);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { category, content, confidence, source } = body ?? {};
    if (!category || !content) {
      return NextResponse.json(
        { error: "category and content are required" },
        { status: 400 }
      );
    }

    const created = await createProfileFacet(userId, {
      category,
      content,
      confidence,
      source,
    });

    return NextResponse.json(created);
  } catch (err) {
    const message = err?.message || "Failed to create profile facet";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
