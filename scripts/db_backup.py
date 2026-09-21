#!/usr/bin/env python3
"""Backup / restore all ingest tables (threads, restaurants, mentions, excluded_brands, geocode_cache).

Usage:
  python3 scripts/db_backup.py backup                  # -> data/backups/db-backup-<ts>.json
  python3 scripts/db_backup.py restore <file> [--force] # TRUNCATE + reload from a backup

Reads DATABASE_URL from the environment or .env. The JSON dump preserves every
column (including primary keys) so foreign keys line up on restore; serial
sequences are reset afterward. Restore is the rollback path before/after a wipe.
"""
from __future__ import annotations
import sys, os, json, datetime

# FK-safe insert order (and safe delete/truncate order in reverse/cascade)
TABLES = ["threads", "restaurants", "mentions", "excluded_brands", "geocode_cache"]


def _url() -> str:
    u = os.environ.get("DATABASE_URL")
    if not u and os.path.exists(".env"):
        for line in open(".env"):
            if line.startswith("DATABASE_URL="):
                u = line.split("=", 1)[1].strip().strip('"').strip("'")
    if not u:
        sys.exit("No DATABASE_URL in env or .env")
    return u


def _connect():
    import psycopg
    url = _url()
    last = None
    for u in (url, url + ("&" if "?" in url else "?") + "sslmode=require"):
        try:
            return psycopg.connect(u)
        except Exception as e:  # noqa: BLE001
            last = e
    sys.exit(f"connect failed: {last!r}")


def backup() -> str:
    conn = _connect()
    cur = conn.cursor()
    out = {"_meta": {"created": datetime.datetime.now(datetime.timezone.utc).isoformat()}}
    for t in TABLES:
        cur.execute(f"SELECT * FROM {t}")
        cols = [d[0] for d in cur.description]
        rows = [dict(zip(cols, r)) for r in cur.fetchall()]
        out[t] = {"columns": cols, "rows": rows}
        print(f"  {t}: {len(rows)} rows")
    conn.close()
    os.makedirs("data/backups", exist_ok=True)
    ts = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    path = f"data/backups/db-backup-{ts}.json"
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(json.dumps(out, default=str, ensure_ascii=False))
    print(f"wrote {path} ({os.path.getsize(path)} bytes)")
    return path


def restore(path: str, force: bool = False) -> None:
    with open(path, encoding="utf-8") as fh:
        data = json.load(fh)
    conn = _connect()
    cur = conn.cursor()

    # Safety check: verify live restaurant count vs backup restaurant count
    cur.execute("SELECT COUNT(*)::int FROM restaurants")
    live_count = cur.fetchone()[0]
    backup_restaurants = len(data.get("restaurants", {}).get("rows", []))

    if live_count > 10 and backup_restaurants < (live_count * 0.5) and not force:
        conn.close()
        sys.exit(
            f"ERROR: Safety check failed! Live database has {live_count} restaurants, "
            f"but backup file '{path}' only contains {backup_restaurants} restaurants.\n"
            f"Restoring this file would result in significant data loss.\n"
            f"If you are CERTAIN you want to do this, pass --force."
        )

    truncate_targets = ", ".join(reversed(TABLES))
    cur.execute(f"TRUNCATE {truncate_targets} RESTART IDENTITY CASCADE")
    for t in TABLES:
        if t not in data:
            print(f"  {t}: 0 rows (table not present in backup)"); continue
        cols = data[t]["columns"]
        rows = data[t]["rows"]
        if not rows:
            print(f"  {t}: 0 rows"); continue
        collist = ",".join(f'"{c}"' for c in cols)
        ph = ",".join(["%s"] * len(cols))
        cur.executemany(
            f"INSERT INTO {t} ({collist}) VALUES ({ph})",
            [[r[c] for c in cols] for r in rows],
        )
        print(f"  restored {t}: {len(rows)} rows")

    # Reset serial PKs for tables with serial primary keys
    for t in ("restaurants", "mentions", "excluded_brands"):
        try:
            cur.execute(
                f"SELECT setval(pg_get_serial_sequence('{t}','id'), COALESCE((SELECT MAX(id) FROM {t}), 1))"
            )
        except Exception:
            pass

    conn.commit()
    conn.close()
    print("restore complete")


if __name__ == "__main__":
    if len(sys.argv) >= 2 and sys.argv[1] == "backup":
        backup()
    elif len(sys.argv) >= 3 and sys.argv[1] == "restore":
        force_flag = "--force" in sys.argv
        restore(sys.argv[2], force=force_flag)
    else:
        sys.exit(__doc__)
