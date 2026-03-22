import { NextResponse } from "next/server";
import { auth } from "@/auth";

const { assembleProfileBlock } = require("@/lib/profile");

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

    const profileBlock = await assembleProfileBlock(userId);
    return NextResponse.json({ profileBlock });
  } catch (err) {
    const message = err?.message || "Failed to assemble profile block";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
