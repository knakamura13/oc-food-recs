#!/usr/bin/env python3
"""Backup / restore the three ingest tables (threads, restaurants, mentions).

Usage:
  python3 scripts/db_backup.py backup            # -> data/backups/db-backup-<ts>.json
  python3 scripts/db_backup.py restore <file>    # TRUNCATE + reload from a backup

Reads DATABASE_URL from the environment or .env. The JSON dump preserves every
column (including primary keys) so foreign keys line up on restore; serial
sequences are reset afterward. Restore is the rollback path before/after a wipe.
"""
from __future__ import annotations
import sys, os, json, datetime

TABLES = ["threads", "restaurants", "mentions"]  # FK-safe insert order


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


def restore(path: str) -> None:
    data = json.load(open(path, encoding="utf-8"))
    conn = _connect()
    cur = conn.cursor()
    cur.execute("TRUNCATE mentions, restaurants, threads RESTART IDENTITY CASCADE")
    for t in TABLES:
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
    for t in ("restaurants", "mentions"):  # reset serial PKs
        cur.execute(
            f"SELECT setval(pg_get_serial_sequence('{t}','id'), COALESCE((SELECT MAX(id) FROM {t}), 1))"
        )
    conn.commit()
    conn.close()
    print("restore complete")


if __name__ == "__main__":
    if len(sys.argv) >= 2 and sys.argv[1] == "backup":
        backup()
    elif len(sys.argv) == 3 and sys.argv[1] == "restore":
        restore(sys.argv[2])
    else:
        sys.exit(__doc__)
