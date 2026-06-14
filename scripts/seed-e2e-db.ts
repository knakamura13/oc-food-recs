import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import pg from "pg";
import * as schema from "../src/lib/server/db/schema.ts";

const THREAD_ID = "orangecounty-e2e1";

async function seed() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for db:seed-e2e");
  }

  const isFixtureDb =
    process.env.CI === "true" ||
    process.env.E2E_SEED === "1" ||
    databaseUrl.includes("/e2e");

  if (!isFixtureDb) {
    throw new Error(
      "Refusing to truncate a non-fixture database. Use a dedicated e2e DB (…/e2e), set E2E_SEED=1, or run in CI.",
    );
  }

  const pool = new pg.Pool({ connectionString: databaseUrl });
  const db = drizzle(pool, { schema });

  await db.execute(
    sql`TRUNCATE mentions, restaurants, threads RESTART IDENTITY CASCADE`,
  );

  await db.insert(schema.threads).values({
    id: THREAD_ID,
    subreddit: "orangecounty",
    postId: "e2e1",
    url: "https://www.reddit.com/r/orangecounty/comments/e2e1/",
    title: "E2E fixture thread — mom and pop picks",
    commentCount: 12,
    maxDepth: 4,
    includedInPublish: true,
  });

  const [tacoSpot] = await db
    .insert(schema.restaurants)
    .values({
      name: "La Taco Spot",
      slug: "la-taco-spot",
      location: "Santa Ana",
      cuisine: "Mexican",
      lat: 33.7455,
      lng: -117.8677,
      status: "active",
    })
    .returning({ id: schema.restaurants.id });

  const [ramenHouse] = await db
    .insert(schema.restaurants)
    .values({
      name: "Ramen House",
      slug: "ramen-house",
      location: "Irvine",
      cuisine: "Japanese",
      lat: 33.6846,
      lng: -117.8265,
      status: "active",
    })
    .returning({ id: schema.restaurants.id });

  if (!tacoSpot || !ramenHouse) {
    throw new Error("Failed to insert fixture restaurants");
  }

  await db.insert(schema.mentions).values([
    {
      restaurantId: tacoSpot.id,
      threadId: THREAD_ID,
      commentId: `${THREAD_ID}_c1`,
      permalink:
        "https://www.reddit.com/r/orangecounty/comments/e2e1/comment/c1",
      author: "alice",
      body: "Best al pastor in OC",
      score: 15,
      role: "primary",
      commentDate: new Date("2024-06-01T12:00:00Z"),
    },
    {
      restaurantId: ramenHouse.id,
      threadId: THREAD_ID,
      commentId: `${THREAD_ID}_c2`,
      permalink:
        "https://www.reddit.com/r/orangecounty/comments/e2e1/comment/c2",
      author: "bob",
      body: "Tonkotsu is incredible",
      score: 12,
      role: "primary",
      commentDate: new Date("2024-08-15T08:00:00Z"),
    },
  ]);

  await pool.end();
  console.info("E2E seed complete: 1 thread, 2 restaurants, 2 mentions");
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
