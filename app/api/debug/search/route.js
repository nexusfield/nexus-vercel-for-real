// GET /api/debug/search?q=Elon+Musk — see what chunks would be retrieved for a query
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q") || "Elon Musk";
    const { runNavigationAgent } = await import("@/lib/navigationAgent");
    const chunks = await runNavigationAgent(q);
    return Response.json({
      query: q,
      chunksRetrieved: chunks.length,
      chunks: chunks.map((c) => ({
        id: c.id,
        module: c.module,
        tags: c.tags,
        raw_preview: c.raw_text.substring(0, 200) + (c.raw_text.length > 200 ? "..." : ""),
        len: c.raw_text.length,
      })),
    });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
