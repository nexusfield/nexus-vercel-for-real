import { NextResponse } from "next/server";
import { auth } from "@/auth";

const {
  updateProfileFacet,
  deactivateProfileFacet,
} = require("@/lib/profile");

function getUserId(session) {
  return session?.user?.email || session?.user?.id || "";
}

export async function PATCH(request, { params }) {
  try {
    const id = params?.id;
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const session = await auth();
    const userId = getUserId(session);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const allowedKeys = ["category", "content", "confidence", "active"];
    const hasAny = allowedKeys.some((key) =>
      Object.prototype.hasOwnProperty.call(body || {}, key)
    );
    if (!hasAny) {
      return NextResponse.json(
        { error: "At least one of category, content, confidence, or active is required" },
        { status: 400 }
      );
    }

    const updated = await updateProfileFacet(userId, id, body || {});
    return NextResponse.json(updated);
  } catch (err) {
    const message = err?.message || "Failed to update profile facet";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const id = params?.id;
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const session = await auth();
    const userId = getUserId(session);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await deactivateProfileFacet(userId, id);
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err?.message || "Failed to deactivate profile facet";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
