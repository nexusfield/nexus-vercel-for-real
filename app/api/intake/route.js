export async function POST(request) {
  try {
    if (!process.env.ANTHROPIC_API_KEY?.trim()) {
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
    const confirmation = await runIntakeAgent(rawText);

    return Response.json({ confirmation });
  } catch (err) {
    const message = err?.message || "Intake failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
