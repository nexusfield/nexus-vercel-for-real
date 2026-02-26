const db = require("@/lib/db");

export async function GET() {
  try {
    const rows = db
      .prepare(
        `SELECT id, structured_data, module, tags, created_at
         FROM knowledge
         ORDER BY created_at DESC`
      )
      .all();

    const records = rows.map((r) => {
      let structured_data;
      let tags;
      try {
        structured_data = JSON.parse(r.structured_data || "{}");
      } catch {
        structured_data = r.structured_data;
      }
      try {
        tags = JSON.parse(r.tags || "[]");
      } catch {
        tags = [];
      }
      return {
        id: r.id,
        structured_data,
        module: r.module,
        tags,
        created_at: r.created_at,
      };
    });

    return Response.json(records);
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
