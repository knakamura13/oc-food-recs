#!/usr/bin/env python3
"""Backfill Mom & pop policy v2 over existing restaurants.

Idempotent. Safe without DATABASE_URL (prints a skip message and exits 0), so CI
can invoke it without production credentials.

What it does:
  1. Upserts ``scripts/exclusions_seed.json`` into ``excluded_brands`` (unless
     ``--skip-seed``).
  2. Reclassifies unreviewed rows through the shared registry + reviewed,
     identity-bound worldwide evidence policy. Verified six-plus counts exclude;
     complete worldwide counts of one to five establish independence; other
     rows stay unknown. Automated LLM/count/density queues are retired.

Human-reviewed rows are never touched. Visitor/dedupe queues remain queued unless
an authoritative exclusion upgrades them. No model call runs during backfill.

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

    pending_registry_rows = (
        seed_exclusions.load_seed() if not apply and not skip_seed else None
    )
    saved = sys.argv
    sys.argv = ["apply_exclusions.py"] + (["--apply"] if apply else [])
    try:
        return apply_exclusions.main(pending_registry_rows=pending_registry_rows)
    finally:
        sys.argv = saved


if __name__ == "__main__":
    sys.exit(main())
