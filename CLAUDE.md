# CLAUDE.md — oc-food-recs

Guidance for Claude Code working in this repository.

## Local development & QA database

The app is **fully server-rendered from a Railway Postgres database**
(`src/routes/+page.server.ts` → `src/lib/server/db/index.ts`). There is **no mock,
fixture, or fallback** data path, so the page returns **HTTP 500 on every request**
when `DATABASE_URL` is unset.

The connection string lives in the **main checkout's** gitignored `.env` (the dev
database used day-to-day). Git **worktrees do not inherit** that `.env`.

**For any browser / Preview QA run from a worktree:** copy the main checkout's `.env`
into the worktree and leave it in place.

```sh
# from the worktree root (.claude/worktrees/<name>/)
cp ../../../.env .env
```

- **Standing, pre-authorized decision (knakamura, 2026-05-30):** use the existing
  Railway DB for local QA. **Do not ask** for database authorization each time.
- Page loads are **read-only SELECTs**, so pointing QA at this DB is safe.
- `.env` is gitignored — it won't be committed — so **do not delete** the worktree
  `.env` after QA.

## Code style

- **No Prettier.** Never run `npx prettier` — it corrupts the repo's style.
- Indent with **tabs**; use **single quotes**.
- Svelte 5 runes (`$state` / `$derived` / `$effect` / `$props`); components use scoped
  `<style>` blocks (no Tailwind, no global stylesheet).
