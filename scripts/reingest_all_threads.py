#!/usr/bin/env python3
"""Thin wrapper — delegates to `reddit_pipeline.py reingest`.

Kept for backwards-compatibility with any existing scripts or docs that
reference this file directly.  Prefer running:

    python3 scripts/reddit_pipeline.py reingest [--dry-run] [--limit N]
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import reddit_pipeline as rp

if __name__ == "__main__":
    sys.exit(rp.main(["reingest"] + sys.argv[1:]))
