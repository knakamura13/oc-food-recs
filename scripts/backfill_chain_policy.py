#!/usr/bin/env python3
"""Backfill Mom & pop policy v1 over existing restaurants.

Idempotent. Safe without DATABASE_URL (prints a skip message and exits 0), so CI
can invoke it without production credentials.

What it does:
  1. Upserts ``scripts/exclusions_seed.json`` into ``excluded_brands`` (unless
     ``--skip-seed``).
  2. Reclassifies every restaurant with ``reviewed_at IS NULL`` using the same
     matcher as ingest: denylist -> ``excluded`` / ``likely_chain``; 4+ distinct
     SoCal cities -> ``pending_review`` / ``likely_chain``; otherwise
     ``active`` / ``independent``.

Human-reviewed rows are never touched. LLM ``chain_suspect`` is ingest-time only
and is not replayed here. Unreviewed ``pending_review`` rows (including
``user_reported_chain``) stay in the admin queue unless the denylist upgrades
them to ``excluded``.

Usage:
  python3 scripts/backfill_chain_policy.py                 # dry run (default)
  python3 scripts/backfill_chain_policy.py --apply         # write changes
  python3 scripts/backfill_chain_policy.py --apply --skip-seed
"""
from __future__ import annotations

import os
import sys

# Ensure we can import sibling scripts.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import apply_exclusions
import seed_exclusions


def main() -> int:
    args = sys.argv[1:]
    skip_seed = "--skip-seed" in args
    apply = "--apply" in args

    if not skip_seed:
        seed_argv = ["seed_exclusions.py"]
        if not apply:
            seed_argv.append("--dry-run")
        saved = sys.argv
        sys.argv = seed_argv
        try:
            seed_rc = seed_exclusions.main()
        finally:
            sys.argv = saved
        if seed_rc:
            return seed_rc
        print()

    saved = sys.argv
    sys.argv = ["apply_exclusions.py"] + (["--apply"] if apply else [])
    try:
        return apply_exclusions.main()
    finally:
        sys.argv = saved


if __name__ == "__main__":
    sys.exit(main())
