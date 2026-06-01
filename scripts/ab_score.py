#!/usr/bin/env python3
"""Score one or more extractor outputs against the Claude oracle reference.

Usage: python3 scripts/ab_score.py <variant.jsonl> [<variant2.jsonl> ...]
All paths are relative to the ab-test dir. Oracle = claude.jsonl.
Reports objective, cross-variant-comparable metrics + a targeted scorecard on
the specific failures the original gemma4:latest run exhibited.
"""
import sys, json, re, unicodedata
from pathlib import Path

AB = Path("data/threads/orangecounty-1sb0qo7/ab-test")


def load(name):
    return {json.loads(l)["comment_id"]: json.loads(l)
            for l in open(AB / name, encoding="utf-8") if l.strip()}


def nkey(s):
    if not s:
        return ""
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "", s)


def names(rec):
    return {nkey(e["name"]) for e in rec.get("entities", []) if e.get("name")}


oracle = load("claude.jsonl")
comments = load("comments.jsonl")
# Specific failures from the original gemma4:latest run.
DROP_IDS = ["oe42lnv", "oe0do32", "oe40jn0", "oe037zn", "oe0d848", "oe01we4",
            "odzxsme", "oee7dci", "oe06xyh", "oe03zld"]
FAB_IDS = ["oe1oayp", "oe07tk6"]  # wine tasting place; Italian fusion restaurant


def score(fname):
    v = load(fname)
    n_ent = sum(len(r["entities"]) for r in v.values())
    n_empty = sum(1 for r in v.values() if not r["entities"])
    cui = sum(1 for r in v.values() for e in r["entities"] if e.get("cuisine"))
    TP = FP = FN = 0
    missed_rec = 0
    exact = 0
    for cid in comments:
        vn = names(v.get(cid, {})) ; on = names(oracle.get(cid, {}))
        TP += len(vn & on); FP += len(vn - on); FN += len(on - vn)
        if vn == on:
            exact += 1
        if not vn and on:
            missed_rec += 1
    prec = TP / (TP + FP) if TP + FP else 0
    rec = TP / (TP + FN) if TP + FN else 0
    f1 = 2 * prec * rec / (prec + rec) if prec + rec else 0
    return dict(file=fname, ent=n_ent, empty=n_empty, missed_rec=missed_rec,
                exact=exact, prec=prec, rec=rec, f1=f1,
                cui_pct=(100 * cui // n_ent if n_ent else 0))


variants = sys.argv[1:] or ["gemma4.jsonl"]
rows = [score("claude.jsonl")] + [score(f) for f in variants]
rows[0]["file"] = "claude.jsonl (oracle/ref)"

w = max(len(r["file"]) for r in rows)
print(f"{'variant'.ljust(w)} | ent | [] | missedRec | exactName | prec | rec  | F1   | cuisine%")
print("-" * (w + 64))
for r in rows:
    print(f"{r['file'].ljust(w)} | {r['ent']:3d} | {r['empty']:2d} | {r['missed_rec']:9d} | "
          f"{r['exact']:9d} | {r['prec']:.2f} | {r['rec']:.2f} | {r['f1']:.2f} | {r['cui_pct']:3d}%")

print("\n=== Targeted scorecard: the original run's 10 dropped recs + 2 fabrications ===")
loaded = {f: load(f) for f in variants}
for cid in DROP_IDS + FAB_IDS:
    body = comments[cid]["body"][:48]
    tag = "FAB" if cid in FAB_IDS else "DROP"
    cells = []
    for f in variants:
        ents = loaded[f].get(cid, {}).get("entities", [])
        cells.append(f"{f.replace('.jsonl','').replace('gemma4','g')}={'[]' if not ents else '|'.join(e['name'] for e in ents)[:34]}")
    print(f"  [{tag}] {cid} {body!r}")
    for c in cells:
        print(f"        {c}")
