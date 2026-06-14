import { db } from "$lib/server/db";
import { sql } from "drizzle-orm";
import type { RequestHandler } from "./$types";

interface CountRow {
  restaurant_count: number;
  thread_count: number;
  mention_count: number;
}

export const GET: RequestHandler = async () => {
  try {
    const result = await db.execute(sql`
      SELECT
        (SELECT COUNT(*)::int FROM restaurants WHERE status <> 'excluded') AS restaurant_count,
        (SELECT COUNT(*)::int FROM threads WHERE included_in_publish = true) AS thread_count,
        (SELECT COUNT(*)::int FROM mentions m
          JOIN threads t ON t.id = m.thread_id
          WHERE t.included_in_publish = true) AS mention_count
    `);

    const row = (result.rows[0] ?? {}) as Partial<CountRow>;

    return new Response(
      JSON.stringify({
        ok: true,
        timestamp: new Date().toISOString(),
        restaurant_count: row.restaurant_count ?? 0,
        thread_count: row.thread_count ?? 0,
        mention_count: row.mention_count ?? 0,
      }),
      {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
      },
    );
  } catch {
    return new Response(
      JSON.stringify({
        ok: false,
        timestamp: new Date().toISOString(),
        error: "Database unavailable",
      }),
      {
        status: 503,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
      },
    );
  }
};
