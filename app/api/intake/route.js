import { getEnv } from "@/lib/getEnv";

export async function POST(request) {
  try {
    const apiKey = getEnv("ANTHROPIC_API_KEY");
    if (!apiKey?.trim()) {
      return Response.json(
        { error: "ANTHROPIC_API_KEY is missing. Add it to .env.local and restart the dev server." },
        { status: 500 }
      );
    }
    const body = await request.json();
    const { rawText } = body ?? {};

    if (!rawText || typeof rawText !== "string") {
      return Response.json({ error: "rawText is required" }, { status: 400 });
    }

    const { runIntakeAgent } = await import("@/lib/intakeAgent");
    const result = await runIntakeAgent(rawText);

    return Response.json({
      confirmation: result.confirmation,
      ids: result.ids ?? [],
    });
  } catch (err) {
    const message = err?.message || "Intake failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
