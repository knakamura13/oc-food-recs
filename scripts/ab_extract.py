#!/usr/bin/env python3
"""A/B-test harness: isolate the LLM extraction stage for one thread.

Subcommands
-----------
  dump-comments  Parse raw/thread.json -> ab-test/comments.jsonl (+ body-only
                 shards for the blind oracle). No network, no model.
  run-gemma      Call the REAL gemma4 (Ollama) on each comment body via the
                 pipeline's own default_extract_entities() -> ab-test/gemma4.jsonl.

This reuses reddit_pipeline's parsing + extraction verbatim and writes ONLY
under data/threads/<thread>/ab-test/. It never touches processed/, the DB,
the geocode cache, or the published dataset.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.request
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))
import reddit_pipeline as rp  # noqa: E402

THREAD = "orangecounty-1sb0qo7"
THREAD_DIR = SCRIPT_DIR.parent / "data" / "threads" / THREAD
RAW = THREAD_DIR / "raw" / "thread.json"
AB = THREAD_DIR / "ab-test"


def _top_level_comments():
    raw = json.loads(RAW.read_text(encoding="utf-8"))
    parsed = rp.parse_reddit_json(raw)
    flat = rp.flatten_comment_tree(parsed["comments"])
    roots = [c for c in flat if c.get("depth") == 0]
    return parsed, roots


def _write_jsonl(path: Path, rows: list[dict]) -> None:
    with path.open("w", encoding="utf-8") as fh:
        for row in rows:
            fh.write(json.dumps(row, ensure_ascii=False) + "\n")


def cmd_dump(args) -> None:
    AB.mkdir(parents=True, exist_ok=True)
    parsed, roots = _top_level_comments()
    # Full record (for the report / judging).
    rows = [
        {
            "comment_id": c["id"],
            "author": c.get("author", ""),
            "score": c.get("score", 0),
            "permalink": c.get("permalink", ""),
            "body": c.get("body", ""),  # already normalize_text()'d during parse
        }
        for c in roots
    ]
    _write_jsonl(AB / "comments.jsonl", rows)

    # Body-only shards: the oracle must see EXACTLY what gemma sees (the body),
    # nothing else. Round-robin so each shard has mixed difficulty.
    n = args.shards
    for i in range(n):
        shard = [{"comment_id": r["comment_id"], "body": r["body"]} for r in rows[i::n]]
        _write_jsonl(AB / f"comments.part{i + 1}.jsonl", shard)

    print(f"thread   = {THREAD}")
    print(f"post     = {parsed['post']['title']!r}")
    print(f"top-level comments: {len(rows)} -> {AB / 'comments.jsonl'}")
    print(f"shards   = {n} (sizes: {[len(rows[i::n]) for i in range(n)]})")


def _extract_with(body: str, model: str, think):
    """Call Ollama with an optional model override and `think` flag.

    Mirrors reddit_pipeline.default_extract_entities (same prompt/params/parsing)
    but lets us A/B alternate models. `think=False` is required for reasoning
    tags like gemma4:26b, whose chain-of-thought otherwise consumes num_predict
    and leaves `content` empty. Returns (entities, raw, thinking_len).
    """
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": rp.SYSTEM_PROMPT},
            {"role": "user", "content": body},
        ],
        "stream": False,
        "options": {"temperature": 0.0, "num_predict": 512},
    }
    if think is not None:
        payload["think"] = think
    req = urllib.request.Request(
        rp.OLLAMA_URL, data=json.dumps(payload).encode(), headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req, timeout=300) as response:
        body_json = json.loads(response.read())
    msg = body_json.get("message", {})
    raw = (msg.get("content", "") or "").strip()
    thinking_len = len(msg.get("thinking") or "")
    cleaned = raw
    if "```" in cleaned:
        match = re.search(r"```(?:json)?\s*(.*?)```", cleaned, re.DOTALL)
        if match:
            cleaned = match.group(1).strip()
    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError:
        return [], raw, thinking_len
    entities, _ = rp.normalize_extractor_result(parsed)
    return entities, raw, thinking_len


def cmd_gemma(args) -> None:
    AB.mkdir(parents=True, exist_ok=True)
    rows = rp.load_jsonl(AB / "comments.jsonl")
    if args.limit:
        rows = rows[: args.limit]
    out = AB / args.out
    model = args.model or rp.OLLAMA_MODEL
    think = {"omit": None, "true": True, "false": False}[args.think]
    done = ok = empty_content = 0
    with out.open("w", encoding="utf-8") as fh:
        for r in rows:
            try:
                entities, raw, tlen = _extract_with(r["body"], model, think)
                rec = {"comment_id": r["comment_id"], "entities": entities, "raw": raw}
                ok += 1
                if not raw:
                    empty_content += 1
            except Exception as exc:  # one bad call must not kill the run
                rec = {"comment_id": r["comment_id"], "entities": [], "raw": None, "error": str(exc)}
            fh.write(json.dumps(rec, ensure_ascii=False) + "\n")
            fh.flush()
            done += 1
            n_ent = len(rec.get("entities") or [])
            print(f"[{done}/{len(rows)}] {r['comment_id']}: {n_ent} entities", flush=True)
    print(f"model = {model}  think = {args.think}  url = {rp.OLLAMA_URL}")
    print(f"wrote {done} rows ({ok} ok, {empty_content} empty-content) -> {out}")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    sub = ap.add_subparsers(dest="cmd", required=True)

    d = sub.add_parser("dump-comments", help="freeze the 129 top-level comments")
    d.add_argument("--shards", type=int, default=3)
    d.set_defaults(func=cmd_dump)

    g = sub.add_parser("run-gemma", help="run real gemma4 over the comments")
    g.add_argument("--out", default="gemma4.jsonl")
    g.add_argument("--limit", type=int, default=0, help="0 = all")
    g.add_argument("--model", default=None, help="model tag (default: OC_FOOD_RECS_OLLAMA_MODEL)")
    g.add_argument("--think", default="omit", choices=["omit", "true", "false"],
                   help="set the Ollama `think` flag; use false for gemma4:26b")
    g.set_defaults(func=cmd_gemma)

    args = ap.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
