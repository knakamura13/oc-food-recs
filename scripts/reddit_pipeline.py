#!/usr/bin/env python3
from __future__ import annotations

import argparse
import concurrent.futures
import copy
import difflib
import html as html_mod
import json
import os
import re
import shutil
import sys
import threading
import time
import tqdm
import unicodedata
import urllib.parse
import urllib.request
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable

from bs4 import BeautifulSoup, NavigableString

# psycopg is only required by the `ingest` subcommand. Keep the import optional
# so the rest of the pipeline (init-thread, build-thread) continues to
# work in environments where psycopg isn't installed.
try:
    import psycopg  # type: ignore[import-not-found]
except ImportError:  # pragma: no cover - environment-dependent
    psycopg = None  # type: ignore[assignment]

try:
    from rapidfuzz import fuzz as _rapidfuzz  # type: ignore[import-not-found]
except ImportError:  # pragma: no cover - environment-dependent
    _rapidfuzz = None  # type: ignore[assignment]


ROOT = Path(__file__).resolve().parents[1]
DATA_ROOT = ROOT / "data"
THREADS_ROOT = DATA_ROOT / "threads"
UNINGESTED_ROOT = DATA_ROOT / "uningested-threads"
GEOCODE_CACHE_PATH = DATA_ROOT / "geocode-cache.json"
GEOCODE_MIN_INTERVAL_S = 1.05  # Nominatim usage policy: max ~1 request/second
_last_geocode_ts = 0.0
_nominatim_lock = threading.Lock()

OLLAMA_URL = os.environ.get("OC_FOOD_RECS_OLLAMA_URL", "http://127.0.0.1:11434/api/chat")
OLLAMA_MODEL = os.environ.get("OC_FOOD_RECS_OLLAMA_MODEL", "gemma4:latest")
# Reasoning-capable tags (e.g. gemma4:26b) emit a chain-of-thought that consumes the
# num_predict budget and leaves the JSON answer empty -- silently dropping the record.
# Sending think=false makes every model answer directly; it is a no-op on non-thinking
# tags like gemma4:latest. Override with OC_FOOD_RECS_OLLAMA_THINK=true|false|omit.
_THINK_ENV = os.environ.get("OC_FOOD_RECS_OLLAMA_THINK", "false").strip().lower()
OLLAMA_THINK = {"true": True, "false": False, "omit": None, "": None}.get(_THINK_ENV, False)

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
HEADERS = {"User-Agent": "oc-food-recs-pipeline/1.0 (personal project)"}
OC_BOUNDS = {
    # viewbox is aligned with the post-filter box in default_geocode so bounded=1
    # doesn't reject edge cities (Long Beach/Seal Beach) the post-filter accepts.
    "viewbox": "-118.2,33.3,-117.3,34.0",
    "bounded": "1",
}

ENDORSEMENT_TYPES = {"dish_rec", "endorsement", "personal_story"}
THREAD_FOLDER_PATTERN = "{subreddit}-{post_id}"

SYSTEM_PROMPT = """You are a structured data extractor. Given a Reddit comment recommending food/drink spots, extract each establishment mentioned into a JSON array.

For each establishment, return:
- "name": the establishment's PROPER name (required) -- not a description of it. For "Ake Larry, a tiny Italian fusion spot", the name is "Ake Larry", not "Italian fusion spot".
- "location": city or neighborhood if mentioned, else null
- "street": street name or cross-streets if mentioned (e.g. "Main St", "Bristol and Sunflower"), else null
- "cuisine": cuisine type if inferable from the name or text, else null

Include any food or drink establishment (restaurants, cafes, bakeries, ice cream shops, delis, food trucks, etc.).
A proper name IS a recommendation even if it does not sound food-related and even if it is terse: a bare name ("Keno's") or "Name in City" ("Pops in Santa Ana") must be extracted.
Infer cuisine when the name or text makes it clear: "Peter's Burgers" -> Burgers, "Pho 79" -> Vietnamese, "Tama Sushi" -> Sushi, "El Farolito" -> Mexican, "Gina's Pizza" -> Pizza. Use null only when genuinely unclear.
Do NOT invent names from generic phrases: "a wine tasting place", "a taco truck", "that breakfast spot" are not names -- skip them unless a proper name is given.
Expand common Orange County abbreviations: HB = Huntington Beach, CM = Costa Mesa, SA/SNA = Santa Ana, FV = Fountain Valley, GG = Garden Grove, CdM = Corona del Mar, DP = Dana Point, SJC = San Juan Capistrano, LB = Long Beach, MV = Mission Viejo, LF = Lake Forest, RSM = Rancho Santa Margarita.

If the comment is NOT recommending any food/drink establishment (e.g., a question, a meta comment, or only a closed/defunct place being reminisced about), return an empty array [].

Examples:
Comment: "Pops in Santa Ana on Main St"
JSON: [{"name": "Pops", "location": "Santa Ana", "street": "Main St", "cuisine": null}]
Comment: "Peter's Burgers in Tustin, best patty melt around"
JSON: [{"name": "Peter's Burgers", "location": "Tustin", "street": null, "cuisine": "Burgers"}]
Comment: "Check out Pho 79 near Bristol and Sunflower."
JSON: [{"name": "Pho 79", "location": null, "street": "Bristol and Sunflower", "cuisine": "Vietnamese"}]

Return ONLY a valid JSON array at the top level (e.g. [ {...} ]), never an object wrapper. No explanation, no markdown fences."""


def text_of(tag: Any) -> str:
    if tag is None:
        return ""

    parts: list[str] = []
    for child in tag.descendants:
        if isinstance(child, NavigableString):
            parts.append(str(child))
    return normalize_text("".join(parts))


def normalize_text(value: str) -> str:
    value = html_mod.unescape(value)
    value = re.sub(r"\s+", " ", value)
    return value.strip()


def rich_text(container: Any) -> str:
    if container is None:
        return ""

    blocks: list[str] = []
    for child in container.children:
        if isinstance(child, NavigableString):
            text = normalize_text(str(child))
            if text:
                blocks.append(text)
            continue

        tag = child.name
        if tag == "p":
            blocks.append(inline_text(child))
        elif tag == "blockquote":
            inner = rich_text(child)
            blocks.append("\n".join("> " + line for line in inner.splitlines()))
        elif tag in ("ul", "ol"):
            for index, item in enumerate(child.find_all("li", recursive=False), 1):
                prefix = f"{index}. " if tag == "ol" else "- "
                blocks.append(prefix + inline_text(item))
        elif tag == "div":
            nested = rich_text(child)
            if nested:
                blocks.append(nested)
        else:
            blocks.append(inline_text(child))

    return "\n\n".join(block for block in blocks if block)


def inline_text(tag: Any) -> str:
    parts: list[str] = []
    for node in tag.children:
        if isinstance(node, NavigableString):
            parts.append(str(node))
        elif node.name == "a":
            href = node.get("href", "")
            label = text_of(node)
            parts.append(f"[{label}]({href})" if href and label else label)
        elif node.name in ("strong", "b"):
            parts.append(f"**{text_of(node)}**")
        elif node.name in ("em", "i"):
            parts.append(f"*{text_of(node)}*")
        elif node.name == "code":
            parts.append(f"`{text_of(node)}`")
        elif node.name == "br":
            parts.append("\n")
        else:
            parts.append(text_of(node))
    return normalize_text("".join(parts))


def extract_post_id(raw_html: str) -> str:
    patterns = [
        r'post-id="t3_([^"]+)"',
        r'postid="t3_([^"]+)"',
        r'/comments/([a-z0-9]+)/comment/',
        r'"postId":"t3_([^"]+)"',
        r'&quot;id&quot;:&quot;t3_([^&]+)&quot;',
    ]
    for pattern in patterns:
        match = re.search(pattern, raw_html, re.IGNORECASE)
        if match:
            return match.group(1)
    return ""


def extract_subreddit(raw_html: str, soup: BeautifulSoup) -> str:
    subreddit_header = soup.find("shreddit-subreddit-header")
    if subreddit_header and subreddit_header.get("name"):
        return subreddit_header["name"]

    patterns = [
        r'prefixedName&quot;:&quot;r/([^&]+)&quot;',
        r"/r/([^/]+)/comments/",
    ]
    for pattern in patterns:
        match = re.search(pattern, raw_html)
        if match:
            return match.group(1)
    return ""


def parse_reddit_json(reddit_json: list[dict[str, Any]]) -> dict[str, Any]:
    """Parse Reddit JSON response into the pipeline's expected schema."""
    post_data = reddit_json[0]["data"]["children"][0]["data"]
    comments_data = reddit_json[1]["data"]["children"]

    post_id = post_data.get("id", "")
    subreddit = post_data.get("subreddit", "")
    post_title = normalize_text(post_data.get("title", ""))
    post_body = normalize_text(post_data.get("selftext", ""))
    post_author = post_data.get("author", "[deleted]")
    post_url = post_data.get("url", "")
    flair = normalize_text(post_data.get("link_flair_text", "")) or ""

    def parse_comment(comment_data: dict[str, Any], depth: int = 0) -> dict[str, Any] | None:
        if comment_data.get("kind") != "t1":
            return None

        data = comment_data["data"]
        comment_id = data.get("id", "")
        author = data.get("author", "[deleted]")
        body = normalize_text(data.get("body", ""))
        score = data.get("score", 0)
        created_utc = data.get("created_utc", "")
        parent_id = data.get("parent_id", "")
        permalink = data.get("permalink", "")

        if not body and author == "[deleted]":
            body = "[deleted]"

        replies = []
        if "replies" in data and data["replies"]:
            replies_data = data["replies"]["data"]["children"]
            for reply_data in replies_data:
                parsed = parse_comment(reply_data, depth + 1)
                if parsed:
                    replies.append(parsed)

        return {
            "id": comment_id,
            "author": author,
            "body": body,
            "score": score,
            "created_utc": str(created_utc),
            "depth": depth,
            "parent_id": parent_id,
            "permalink": f"https://www.reddit.com{permalink}" if permalink else "",
            "replies": replies,
        }

    comments: list[dict[str, Any]] = []
    for comment_data in comments_data:
        parsed = parse_comment(comment_data, 0)
        if parsed:
            comments.append(parsed)

    def sort_tree(nodes: list[dict[str, Any]]) -> None:
        nodes.sort(key=lambda node: node["score"], reverse=True)
        for node in nodes:
            sort_tree(node["replies"])

    sort_tree(comments)

    return {
        "post": {
            "id": post_id,
            "subreddit": subreddit,
            "title": post_title,
            "body": post_body,
            "author": post_author,
            "flair": flair,
            "url": post_url,
        },
        "comment_count": len(comments),
        "max_depth": _get_max_depth(comments),
        "comments": comments,
    }


def _get_max_depth(nodes: list[dict[str, Any]]) -> int:
    if not nodes:
        return 0
    return max(node["depth"] + _get_max_depth(node["replies"]) for node in nodes)


def parse_saved_reddit_html(html_path: Path) -> dict[str, Any]:
    raw_html = html_path.read_text(encoding="utf-8")
    soup = BeautifulSoup(raw_html, "lxml")

    title_el = soup.find("h1", id=re.compile(r"^post-title-"))
    post_title = text_of(title_el)

    post_body_div = soup.find("div", id=re.compile(r"^t3_.*-post-rtjson-content$"))
    post_body = rich_text(post_body_div)

    post_author = ""
    credit = soup.find("shreddit-post-credit-bar") or soup.find(attrs={"credit-bar": True})
    if credit and credit.get("author"):
        post_author = credit["author"]
    else:
        author_link = soup.select_one('[slot="authorName"] a, a[href*="/user/"]')
        if author_link and "/user/" in (author_link.get("href") or ""):
            post_author = normalize_text(author_link.get_text())

    post_id = extract_post_id(raw_html)
    subreddit = extract_subreddit(raw_html, soup)

    flair = ""
    flair_el = soup.select_one(".flair-content")
    if flair_el:
        flair = text_of(flair_el)

    comment_tags = soup.find_all("shreddit-comment")
    comments: list[dict[str, Any]] = []
    seen_ids: set[str] = set()

    for tag in comment_tags:
        comment_id = tag.get("thingid", "")
        if not comment_id or comment_id in seen_ids:
            continue
        seen_ids.add(comment_id)

        author = tag.get("author", "[deleted]")
        depth = int(tag.get("depth", 0))
        parent_id = tag.get("parentid", None)
        score = tag.get("score", "0")
        created = tag.get("created", "")
        permalink = tag.get("permalink", "")

        body_id = f"{comment_id}-post-rtjson-content"
        body_div = tag.find("div", id=body_id)
        if body_div is None:
            slot_div = tag.find("div", attrs={"slot": "comment"})
            if slot_div:
                body_div = slot_div.find("div", class_=lambda value: value and "rtjson-content" in value)
                if body_div is None:
                    body_div = slot_div

        body = rich_text(body_div) if body_div else ""
        if not body and author == "[deleted]":
            body = "[deleted]"

        try:
            score_int = int(score)
        except (TypeError, ValueError):
            score_int = 0

        comments.append(
            {
                "id": comment_id,
                "author": author,
                "body": body,
                "score": score_int,
                "created_utc": created,
                "depth": depth,
                "parent_id": parent_id,
                "permalink": f"https://www.reddit.com{permalink}" if permalink else "",
            }
        )

    by_id = {comment["id"]: {**comment, "replies": []} for comment in comments}
    roots: list[dict[str, Any]] = []
    for comment in comments:
        node = by_id[comment["id"]]
        parent_id = comment["parent_id"]
        if parent_id and parent_id in by_id:
            by_id[parent_id]["replies"].append(node)
        else:
            roots.append(node)

    def sort_tree(nodes: list[dict[str, Any]]) -> None:
        nodes.sort(key=lambda node: node["score"], reverse=True)
        for node in nodes:
            sort_tree(node["replies"])

    sort_tree(roots)

    return {
        "post": {
            "id": post_id,
            "subreddit": subreddit,
            "title": post_title,
            "body": post_body,
            "author": post_author,
            "flair": flair,
            "url": f"https://www.reddit.com/r/{subreddit}/comments/{post_id}/" if subreddit and post_id else "",
        },
        "comment_count": len(comments),
        "max_depth": max((comment["depth"] for comment in comments), default=0),
        "comments": roots,
    }


def flatten_comment_tree(nodes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    flat: list[dict[str, Any]] = []
    for node in nodes:
        current = {key: value for key, value in node.items() if key != "replies"}
        flat.append(current)
        flat.extend(flatten_comment_tree(node["replies"]))
    return flat


def slugify(value: str) -> str:
    return re.sub(r"(^-|-$)", "", re.sub(r"[^a-z0-9]+", "-", value.lower()))


def assign_slugs(
    restaurants: list[dict[str, Any]],
    existing: list[dict[str, Any]] | None = None
) -> list[tuple[dict[str, Any], str]]:
    """Assign each restaurant a URL slug from its name, deduplicating against
    existing entries and suffixing -2/-3/... on true name collisions.
    """
    existing = existing or []
    used_slugs = {e["slug"] for e in existing}
    out: list[tuple[dict[str, Any], str]] = []

    for r in restaurants:
        matched_slug = None

        for e in existing:
            if is_match(r, e):
                matched_slug = e["slug"]
                break

        if matched_slug:
            slug = matched_slug
        else:
            base = slugify(r["name"])
            slug = base
            n = 2
            while slug in used_slugs:
                slug = f"{base}-{n}"
                n += 1
            used_slugs.add(slug)

        out.append((r, slug))
        existing.append({
            "name": r["name"],
            "slug": slug,
            "location": r.get("location"),
            "lat": r.get("lat"),
            "lng": r.get("lng"),
        })

    return out


def get_connected_components(nodes: list[int], adjacency: dict[int, list[int]]) -> list[list[int]]:
    visited: set[int] = set()
    components: list[list[int]] = []
    for node in nodes:
        if node in visited:
            continue
        component: list[int] = []
        queue: deque[int] = deque([node])
        visited.add(node)
        while queue:
            current = queue.popleft()
            component.append(current)
            for neighbor in adjacency.get(current, []):
                if neighbor not in visited:
                    visited.add(neighbor)
                    queue.append(neighbor)
        components.append(component)
    return components


def _merge_restaurant_group(entries: list[dict[str, Any]]) -> dict[str, Any]:
    """Collapse is_match-equivalent restaurants from the same ingest batch."""
    best_name = max((entry["name"] for entry in entries), key=len)
    best_location = next((entry.get("location") for entry in entries if entry.get("location")), None)
    best_cuisine = next((entry.get("cuisine") for entry in entries if entry.get("cuisine")), None)
    lat = next((entry.get("lat") for entry in entries if entry.get("lat") is not None), None)
    lng = next((entry.get("lng") for entry in entries if entry.get("lng") is not None), None)

    all_endorsements: list[dict[str, Any]] = []
    seen_endorsements: set[str | tuple[str, str, str]] = set()
    for entry in entries:
        for endorsement in entry.get("endorsements", []):
            dedupe_key = _endorsement_dedupe_key(endorsement)
            if dedupe_key in seen_endorsements:
                continue
            seen_endorsements.add(dedupe_key)
            all_endorsements.append(endorsement)
    all_endorsements.sort(key=lambda endorsement: endorsement["score"], reverse=True)

    primary_comments: list[dict[str, Any]] = []
    seen_primary_ids: set[str] = set()
    for entry in entries:
        primary_comment = entry["primary_comment"]
        if primary_comment["id"] in seen_primary_ids:
            continue
        seen_primary_ids.add(primary_comment["id"])
        primary_comments.append(primary_comment)
    primary_comments.sort(key=lambda comment: comment["score"], reverse=True)

    merged = copy.deepcopy(entries[0])
    merged["name"] = best_name
    merged["location"] = best_location
    merged["cuisine"] = best_cuisine
    merged["lat"] = lat
    merged["lng"] = lng
    merged["aggregate_score"] = sum(entry.get("aggregate_score", 0) for entry in entries)
    merged["mention_count"] = sum(entry.get("mention_count", 1) for entry in entries)
    merged["endorsements"] = all_endorsements
    merged["primary_comment"] = primary_comments[0]
    merged["primary_comments"] = primary_comments
    return merged


def collapse_duplicate_restaurants(restaurants: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Merge transitive is_match duplicates within an ingest batch."""
    if len(restaurants) <= 1:
        return restaurants

    adjacency: dict[int, list[int]] = defaultdict(list)
    for i, r1 in enumerate(restaurants):
        for j in range(i + 1, len(restaurants)):
            if is_match(r1, restaurants[j]):
                adjacency[i].append(j)
                adjacency[j].append(i)

    components = get_connected_components(list(range(len(restaurants))), adjacency)
    collapsed: list[dict[str, Any]] = []
    for component in components:
        if len(component) == 1:
            collapsed.append(restaurants[component[0]])
        else:
            entries = [restaurants[index] for index in component]
            collapsed.append(_merge_restaurant_group(entries))
    return collapsed


def thread_folder_name(parsed_thread: dict[str, Any]) -> str:
    post = parsed_thread["post"]
    post_id = post["id"] or slugify(post["title"])
    subreddit = post["subreddit"] or "reddit"
    return THREAD_FOLDER_PATTERN.format(subreddit=subreddit, post_id=post_id)


def ensure_directory(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def write_json(path: Path, data: Any) -> None:
    ensure_directory(path.parent)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


def write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    ensure_directory(path.parent)
    with path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")


def load_json(path: Path, default: Any = None) -> Any:
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    rows: list[dict[str, Any]] = []
    with path.open(encoding="utf-8") as handle:
        for line in handle:
            if line.strip():
                rows.append(json.loads(line))
    return rows


def current_timestamp() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def parse_comment_date(created_utc: Any) -> datetime | None:
    """Convert a Reddit created_utc value (Unix float or ISO 8601 string) to a tz-aware datetime."""
    if not created_utc:
        return None
    val = str(created_utc).strip()
    if not val:
        return None
    try:
        return datetime.fromtimestamp(float(val), tz=timezone.utc)
    except (ValueError, OSError, OverflowError):
        pass
    try:
        return datetime.fromisoformat(val.replace('+0000', '+00:00').replace('Z', '+00:00'))
    except ValueError:
        return None


def manifest_from_parsed_thread(url: str, parsed_thread: dict[str, Any]) -> dict[str, Any]:
    """Build the manifest dict for a parsed Reddit JSON thread (in-memory, no disk I/O)."""
    return {
        "id": thread_folder_name(parsed_thread),
        "subreddit": parsed_thread["post"]["subreddit"],
        "post_id": parsed_thread["post"]["id"],
        "title": parsed_thread["post"]["title"],
        "url": parsed_thread["post"]["url"],
        "include_in_publish": True,
        "comment_count": parsed_thread["comment_count"],
        "max_depth": parsed_thread["max_depth"],
        "acquisition": {
            "imported_at": current_timestamp(),
            "source_url": url,
            "source_type": "reddit_html",
        },
    }


def init_thread(html_path: Path, threads_root: Path = THREADS_ROOT) -> Path:
    parsed_thread = parse_saved_reddit_html(html_path)
    thread_id = thread_folder_name(parsed_thread)
    thread_dir = threads_root / thread_id

    ensure_directory(thread_dir / "raw")
    ensure_directory(thread_dir / "processed")
    ensure_directory(thread_dir / "review")

    shutil.copy2(html_path, thread_dir / "raw" / "thread.html")

    manifest = {
        "id": thread_id,
        "subreddit": parsed_thread["post"]["subreddit"],
        "post_id": parsed_thread["post"]["id"],
        "title": parsed_thread["post"]["title"],
        "url": parsed_thread["post"]["url"],
        "include_in_publish": True,
        "comment_count": parsed_thread["comment_count"],
        "max_depth": parsed_thread["max_depth"],
        "acquisition": {
            "imported_at": current_timestamp(),
            "source_html": html_path.name,
        },
    }
    write_json(thread_dir / "manifest.json", manifest)
    return thread_dir


SENTINEL_NAMES = {"none", "null", "n/a", "na", "unknown", "none.", "n/a."}
# Generic descriptions the model sometimes emits as if they were establishment names.
GENERIC_NAMES = {
    "wine tasting place", "wine tasting", "wine bar", "taco truck", "food truck",
    "breakfast spot", "coffee shop", "sandwich shop", "pizza place", "burger place",
    "dumpling place", "pho place", "pho places", "ice cream shop", "the place", "a place",
}
# Object envelopes some models wrap the array in, e.g. {"establishments": [...]}.
_WRAPPER_KEYS = ("entities", "establishments", "restaurants", "places", "results", "items", "data")
# Backfill cuisine from an unambiguous food word in the name (most specific first).
_CUISINE_KEYWORDS = [
    # concrete food-type words first (win over ethnonyms below)
    ("pizzeria", "Pizza"), ("pizza", "Pizza"), ("taqueria", "Mexican"), ("taco", "Mexican"),
    ("burrito", "Mexican"), ("birria", "Mexican"), ("cantina", "Mexican"), ("sushi", "Sushi"),
    ("ramen", "Ramen"), ("izakaya", "Japanese"), ("teriyaki", "Japanese"), ("pho", "Vietnamese"),
    ("delicatessen", "Deli"), ("deli", "Deli"), ("bakery", "Bakery"), ("bakehouse", "Bakery"),
    ("patisserie", "Bakery"), ("creamery", "Ice Cream"), ("ice cream", "Ice Cream"),
    ("custard", "Ice Cream"), ("gelato", "Ice Cream"), ("donut", "Donuts"), ("doughnut", "Donuts"),
    ("barbecue", "BBQ"), ("bbq", "BBQ"), ("steakhouse", "Steakhouse"), ("burger", "Burgers"),
    ("sandwich", "Sandwiches"), ("seafood", "Seafood"), ("trattoria", "Italian"),
    ("ristorante", "Italian"), ("osteria", "Italian"), ("cucina", "Italian"),
    ("cafe", "Cafe"), ("café", "Cafe"), ("coffee", "Coffee"),
    # ethnonyms last (only fire when the word literally appears in the name)
    ("thai", "Thai"), ("greek", "Greek"), ("persian", "Persian"), ("korean", "Korean"),
    ("vietnamese", "Vietnamese"), ("mexican", "Mexican"), ("italian", "Italian"),
    ("japanese", "Japanese"), ("chinese", "Chinese"), ("indian", "Indian"),
    ("mediterranean", "Mediterranean"), ("peruvian", "Peruvian"), ("burmese", "Burmese"),
]


def cuisine_from_name(name: str) -> str | None:
    """Infer a cuisine from an unambiguous food word in the establishment name."""
    low = name.lower()
    for keyword, cuisine in _CUISINE_KEYWORDS:
        if re.search(rf"\b{re.escape(keyword)}\b", low):
            return cuisine
    return None


def normalize_extractor_result(result: Any) -> tuple[list[dict[str, Any]], str | None]:
    raw: str | None = None
    if isinstance(result, tuple) and len(result) == 2:
        entities, raw = result
    else:
        entities = result

    # Unwrap object envelopes some models emit (e.g. {"establishments": [...]});
    # otherwise treat a lone {"name": ...} object as a single entity.
    if isinstance(entities, dict):
        if not raw and isinstance(entities.get("raw"), str):
            raw = entities.get("raw")
        for key in _WRAPPER_KEYS:
            if isinstance(entities.get(key), list):
                entities = entities[key]
                break
        else:
            entities = [entities] if entities.get("name") else []

    if not isinstance(entities, list):
        return [], raw

    cleaned: list[dict[str, Any]] = []
    for entity in entities:
        if not isinstance(entity, dict):
            continue
        name = normalize_text(str(entity.get("name", "")))
        low = name.strip().lower()
        # Drop sentinel non-names ("None", "N/A") and generic descriptions
        # ("a wine tasting place") the model sometimes emits as if they were names.
        if not low or low in SENTINEL_NAMES or low in GENERIC_NAMES:
            continue
        cuisine = normalize_text(str(entity["cuisine"])) if entity.get("cuisine") else None
        if not cuisine:
            cuisine = cuisine_from_name(name)
        cleaned.append(
            {
                "name": name,
                "location": normalize_text(str(entity["location"]))
                if entity.get("location")
                else None,
                "street": normalize_text(str(entity["street"]))
                if entity.get("street")
                else None,
                "cuisine": cuisine,
            }
        )
    return cleaned, raw


def default_extract_entities(comment_text: str, comment: dict[str, Any] | None = None, manifest: dict[str, Any] | None = None) -> tuple[list[dict[str, Any]], str]:
    payload = json.dumps(
        {
            "model": OLLAMA_MODEL,
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": comment_text},
            ],
            "stream": False,
            "options": {"temperature": 0.0, "num_predict": 512},
            **({"think": OLLAMA_THINK} if OLLAMA_THINK is not None else {}),
        }
    ).encode()

    request = urllib.request.Request(
        OLLAMA_URL,
        data=payload,
        headers={"Content-Type": "application/json"},
    )

    try:
        with urllib.request.urlopen(request, timeout=180) as response:
            body = json.loads(response.read())
    except Exception as exc:
        raise RuntimeError(
            f"Unable to reach Ollama at {OLLAMA_URL}. Start the server or set OC_FOOD_RECS_OLLAMA_URL/OC_FOOD_RECS_OLLAMA_MODEL. {exc}"
        ) from exc

    raw = body.get("message", {}).get("content", "").strip()
    cleaned = raw
    if "```" in cleaned:
        match = re.search(r"```(?:json)?\s*(.*?)```", cleaned, re.DOTALL)
        if match:
            cleaned = match.group(1).strip()

    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError:
        return [], raw

    entities, _ = normalize_extractor_result(parsed)
    return entities, raw


def classify_reply(body_text: str) -> str:
    body = body_text.lower().strip()

    if re.match(r"^[\U0001f000-\U0001ffff\s\U00002600-\U000027bf\U0000fe00-\U0000feff]+$", body):
        return "filler"

    if any(body.startswith(word) or body == word for word in ["yup", "yep", "same", "lol", "rip"]):
        return "filler"

    filler_words = ["thank", "thanks", "noted", "bookmarked", "adding to my list", "saved"]
    if any(word in body for word in filler_words):
        food_words = [
            "taco",
            "burrito",
            "burger",
            "fries",
            "salad",
            "custard",
            "pho",
            "ramen",
            "noodle",
            "rice",
            "chicken",
            "beef",
            "pork",
            "fish",
            "sandwich",
            "pizza",
            "enchilada",
            "soup",
            "curry",
            "sushi",
            "mole",
            "tamale",
            "menudo",
            "birria",
            "carne",
            "torta",
            "chilaquiles",
            "boba",
            "donut",
            "cookie",
            "cake",
            "pie",
            "tea leaf",
        ]
        return "dish_rec" if any(word in body for word in food_words) else "filler"

    if body.rstrip().endswith("?"):
        return "question"

    endorsement_phrases = [
        "the best",
        "love this",
        "so good",
        "amazing",
        "incredible",
        "seconded",
        "underrated",
        "hidden gem",
        "came here to say",
        "best in oc",
        "highly recommend",
        "national treasure",
        "never disappoints",
        "can’t go wrong",
        "can't go wrong",
        "worth the drive",
        "my favorite",
    ]
    if any(phrase in body for phrase in endorsement_phrases):
        return "endorsement"

    story_phrases = [
        "i used to",
        "been going",
        "grew up",
        "i remember",
        "since i was",
        "my family",
        "my mom",
        "my dad",
        "my parents",
        "as a kid",
        "years ago",
        "nostalgic",
    ]
    if any(phrase in body for phrase in story_phrases):
        return "personal_story"

    food_words = [
        "taco",
        "burrito",
        "burger",
        "fries",
        "pho",
        "ramen",
        "pizza",
        "enchilada",
        "curry",
        "sushi",
        "tamale",
        "birria",
        "torta",
        "chilaquiles",
        "donut",
        "cookie",
        "cake",
        "shawarma",
        "falafel",
    ]
    if any(word in body for word in food_words):
        return "dish_rec"

    return "other"


def _fold_accents(value: str) -> str:
    folded = unicodedata.normalize("NFKD", value)
    return "".join(c for c in folded if not unicodedata.combining(c))


def normalize_name(name: str) -> str:
    normalized = _fold_accents(name.lower().strip())
    normalized = re.sub(r"['’]s$", "", normalized)
    normalized = re.sub(r"\s*&\s*", " and ", normalized)
    # Aggressive normalization: strip all whitespace and non-alphanumeric
    # to catch 'Mo Ran Gak' vs 'Morangak' and 'A & B' vs 'A and B'.
    normalized = re.sub(r"[^a-z0-9]", "", normalized)
    return normalized


def _raw_location_key(location: str | None) -> str | None:
    """Stable key for unrecognized location strings (crossroads, neighborhoods)."""
    if not location or not location.strip():
        return None
    raw = _fold_accents(location.strip().lower())
    raw = re.sub(r"\s*&\s*", " and ", raw)
    key = re.sub(r"[^a-z0-9]+", "", raw)
    return key or None


def _locations_match(loc1: str | None, loc2: str | None) -> bool:
    if not loc1 or not loc2:
        return False
    norm1 = normalize_location(loc1)
    norm2 = normalize_location(loc2)
    if norm1 and norm2:
        return norm1 == norm2
    if norm1 is None and norm2 is None:
        key1 = _raw_location_key(loc1)
        key2 = _raw_location_key(loc2)
        return key1 is not None and key1 == key2
    return False


def _is_word_boundary_match(short_name: str, long_name: str) -> bool:
    """
    Check if normalize_name(short_name) is a substring of normalize_name(long_name)
    AND the match aligns with word boundaries in long_name.

    Very short normalized names (< 3 chars) are rejected to prevent collisions
    like "Bo" matching "Bob's Burgers".
    """
    short_norm = normalize_name(short_name)
    long_norm = normalize_name(long_name)

    # Guard: extremely short names are too collision-prone for substring matching.
    if len(short_norm) < 3:
        return False

    if not short_norm or short_norm not in long_norm:
        return False
        
    starts = [m.start() for m in re.finditer(re.escape(short_norm), long_norm)]
    if not starts:
        return False
        
    # Process long_name with the same folding rules as normalize_name.
    long_processed = _fold_accents(long_name.lower().strip())
    long_processed = re.sub(r"['’]s$", "", long_processed)
    long_processed = re.sub(r"\s*&\s*", " and ", long_processed)

    mapping = []
    for i, c in enumerate(long_processed):
        if re.match(r"[a-z0-9]", c):
            mapping.append(i)
            
    for start in starts:
        end = start + len(short_norm) - 1
        
        is_start_boundary = True
        if start > 0:
            if mapping[start] == mapping[start - 1] + 1:
                is_start_boundary = False
                
        is_end_boundary = True
        if end < len(mapping) - 1:
            if mapping[end + 1] == mapping[end] + 1:
                is_end_boundary = False
                
        if is_start_boundary and is_end_boundary:
            return True
            
    return False


def is_match(r1: dict[str, Any], r2: dict[str, Any]) -> bool:
    norm1 = normalize_name(r1["name"])
    norm2 = normalize_name(r2["name"])

    # Substring matching (e.g., "Mo Ran Gak" matches "Mo Ran Gak Restaurant")
    if norm1 == norm2:
        name_match = True
    elif len(norm1) <= len(norm2) and _is_word_boundary_match(r1["name"], r2["name"]):
        name_match = True
    elif len(norm2) < len(norm1) and _is_word_boundary_match(r2["name"], r1["name"]):
        name_match = True
    elif (
        len(norm1) >= 3
        and len(norm2) >= 3
        and _name_score(r1["name"], r2["name"]) >= 0.85
    ):
        name_match = True
    else:
        name_match = False

    if not name_match:
        return False

    # Proximity check: same city or within ~200m (0.002 degrees)
    loc_match = _locations_match(r1.get("location"), r2.get("location"))

    dist_match = False
    if (
        r1.get("lat") is not None
        and r1.get("lng") is not None
        and r2.get("lat") is not None
        and r2.get("lng") is not None
    ):
        dlat = float(r1["lat"]) - float(r2["lat"])
        dlng = float(r1["lng"]) - float(r2["lng"])
        if (dlat**2 + dlng**2) ** 0.5 < 0.002:
            dist_match = True

    return loc_match or dist_match


def _endorsement_dedupe_key(endorsement: dict[str, Any]) -> str | tuple[str, str, str]:
    """Prefer Reddit comment id; fall back to legacy (type, author, body) key."""
    comment_id = endorsement.get("id")
    if comment_id:
        return f"id:{comment_id}"
    return (
        endorsement["type"],
        endorsement["author"],
        endorsement["body"].strip(),
    )


def collect_endorsements(parent_id: str, children_map: dict[str, list[dict[str, Any]]], reply_classes: dict[str, str]) -> list[dict[str, Any]]:
    endorsements: list[dict[str, Any]] = []
    for child in children_map.get(parent_id, []):
        reply_type = reply_classes.get(child["id"], "other")
        if reply_type in ENDORSEMENT_TYPES:
            endorsements.append(
                {
                    "id": child["id"],
                    "permalink": child.get("permalink", ""),
                    "type": reply_type,
                    "author": child["author"],
                    "body": child["body"],
                    "score": child["score"],
                    "created_utc": child.get("created_utc", ""),
                }
            )
        endorsements.extend(collect_endorsements(child["id"], children_map, reply_classes))
    return endorsements


def build_thread_dataset(
    parsed_thread: dict[str, Any],
    entity_records: list[dict[str, Any]],
) -> dict[str, Any]:
    comments = flatten_comment_tree(parsed_thread["comments"])
    comment_map = {comment["id"]: comment for comment in comments}
    roots = [comment for comment in comments if comment["depth"] == 0]
    replies = [comment for comment in comments if comment["depth"] >= 1]

    children_map: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for reply in replies:
        parent_id = reply.get("parent_id")
        if parent_id:
            children_map[parent_id].append(reply)

    reply_classes = {reply["id"]: classify_reply(reply["body"]) for reply in replies}
    entity_map = {record["comment_id"]: record["entities"] for record in entity_records}

    raw_entries: list[dict[str, Any]] = []
    for root in roots:
        endorsements = collect_endorsements(root["id"], children_map, reply_classes)
        for entity in entity_map.get(root["id"], []):
            raw_entries.append(
                {
                    "name": entity["name"],
                    "location": entity.get("location"),
                    "cuisine": entity.get("cuisine"),
                    "score": root["score"],
                    "comment": {
                        "id": root["id"],
                        "author": root["author"],
                        "body": root["body"],
                        "score": root["score"],
                        "permalink": root["permalink"],
                        "created_utc": root.get("created_utc", ""),
                    },
                    "endorsements": endorsements,
                }
            )

    # Group raw entries by name similarity using connected-components (matching
    # the approach in collapse_duplicate_restaurants).  The old dict-key grouping
    # missed substring name variants like "In-N-Out" vs "In-N-Out Burger"
    # because their normalize_name values differ.
    def _names_match(e1: dict[str, Any], e2: dict[str, Any]) -> bool:
        """Name-only match (ignoring location) for within-thread grouping."""
        n1 = normalize_name(e1["name"])
        n2 = normalize_name(e2["name"])
        if n1 == n2:
            return True
        if len(n1) <= len(n2) and _is_word_boundary_match(e1["name"], e2["name"]):
            return True
        if len(n2) < len(n1) and _is_word_boundary_match(e2["name"], e1["name"]):
            return True
        return False

    name_adjacency: dict[int, list[int]] = defaultdict(list)
    for i, e1 in enumerate(raw_entries):
        for j in range(i + 1, len(raw_entries)):
            if _names_match(e1, raw_entries[j]):
                name_adjacency[i].append(j)
                name_adjacency[j].append(i)
    name_components = get_connected_components(list(range(len(raw_entries))), name_adjacency)

    def split_by_location(entries: list[dict[str, Any]]) -> list[list[dict[str, Any]]]:
        """Split name-similar entries by location compatibility.

        Missing-location mentions join a known-location subgroup only when there
        is exactly one distinct canonical city in the name component. When
        multiple known cities are present, missing-location entries stay separate.
        """
        known_locs = {
            normalize_location(entry.get("location"))
            for entry in entries
            if normalize_location(entry.get("location"))
        }
        multi_city = len(known_locs) > 1

        subgroups: list[list[dict[str, Any]]] = []
        null_entries: list[dict[str, Any]] = []

        for entry in entries:
            entry_loc = normalize_location(entry.get("location"))
            if multi_city and entry_loc is None:
                null_entries.append(entry)
                continue

            placed = False
            for subgroup in subgroups:
                compatible = True
                for other in subgroup:
                    other_loc = normalize_location(other.get("location"))
                    if entry_loc and other_loc and entry_loc != other_loc:
                        compatible = False
                        break
                if compatible:
                    subgroup.append(entry)
                    placed = True
                    break
            if not placed:
                subgroups.append([entry])

        if null_entries:
            subgroups.extend([[entry] for entry in null_entries])

        return subgroups

    restaurants: list[dict[str, Any]] = []
    for component in name_components:
        entries = [raw_entries[idx] for idx in component]
        for subgroup in split_by_location(entries):
            subgroup.sort(key=lambda entry: entry["score"], reverse=True)
            primary = subgroup[0]

            all_endorsements: list[dict[str, Any]] = []
            seen_endorsements: set[str | tuple[str, str, str]] = set()
            for entry in subgroup:
                for endorsement in entry["endorsements"]:
                    dedupe_key = _endorsement_dedupe_key(endorsement)
                    if dedupe_key in seen_endorsements:
                        continue
                    seen_endorsements.add(dedupe_key)
                    all_endorsements.append(endorsement)

            all_endorsements.sort(key=lambda endorsement: endorsement["score"], reverse=True)
            best_name = max((entry["name"] for entry in subgroup), key=len)
            best_location = next((entry["location"] for entry in subgroup if entry.get("location")), None)
            best_cuisine = next((entry["cuisine"] for entry in subgroup if entry.get("cuisine")), None)

            restaurants.append(
                {
                    "name": best_name,
                    "location": best_location,
                    "cuisine": best_cuisine,
                    "aggregate_score": sum(entry["score"] for entry in subgroup),
                    "mention_count": len(subgroup),
                    "primary_comment": primary["comment"],
                    "endorsements": all_endorsements,
                }
            )

    restaurants.sort(key=lambda restaurant: restaurant["aggregate_score"], reverse=True)
    return {
        "restaurants": restaurants,
        "meta": {
            "thread_id": thread_folder_name(parsed_thread),
            "source_thread": parsed_thread["post"]["url"],
            "source_title": parsed_thread["post"]["title"],
            "source_post_id": parsed_thread["post"]["id"],
            "total_restaurants": len(restaurants),
            "total_comments_processed": len(comments),
            "model_used": OLLAMA_MODEL,
            "kept_endorsement_types": sorted(ENDORSEMENT_TYPES),
        },
    }


def _env_value(name: str) -> str:
    value = os.environ.get(name)
    if value:
        return value
    env_path = Path(".env")
    if env_path.exists():
        for line in env_path.read_text(encoding="utf-8").splitlines():
            if line.startswith(f"{name}="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    return ""


def _url() -> str:
    return _env_value("DATABASE_URL")


def _connect():
    if psycopg is None:
        return None
    url = _url()
    if not url:
        return None
    for u in (url, url + ("&" if "?" in url else "?") + "sslmode=require"):
        try:
            return psycopg.connect(u, connect_timeout=10)
        except Exception:
            continue
    return None


class GeocodeCache:
    def __init__(self):
        self._conn = None

    @property
    def conn(self):
        if self._conn is None or self._conn.closed:
            self._conn = _connect()
        return self._conn

    def get(self, query: str) -> tuple[float | None, float | None, str | None, str | None] | None:
        if not self.conn:
            return None
        try:
            with self.conn.cursor() as cur:
                cur.execute(
                    "SELECT lat, lng, detail, geocoded_city, retry_after FROM geocode_cache WHERE query = %s",
                    (query,),
                )
                row = cur.fetchone()
                if not row:
                    return None
                lat, lng, detail, city, retry_after = row
                if _is_closed_permanently_detail(detail):
                    return None, None, detail, None
                if lat is not None:
                    return lat, lng, detail, city
                if retry_after and retry_after > datetime.now(timezone.utc):
                    return None, None, "recently failed", None
                return None  # Expired negative cache or query needing retry
        except Exception:
            return None

    def set(
        self,
        query: str,
        result: tuple[float | None, float | None, str | None],
        provider: str,
        geocoded_city: str | None = None,
    ):
        if not self.conn:
            return
        lat, lng, detail = result
        retry_after = None
        if lat is None:
            retry_after = datetime.now(timezone.utc) + timedelta(days=7)

        try:
            with self.conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO geocode_cache (query, provider, lat, lng, detail, geocoded_city, retry_after)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (query) DO UPDATE SET
                        provider = EXCLUDED.provider,
                        lat = EXCLUDED.lat,
                        lng = EXCLUDED.lng,
                        detail = EXCLUDED.detail,
                        geocoded_city = EXCLUDED.geocoded_city,
                        retry_after = EXCLUDED.retry_after,
                        created_at = now()
                    """,
                    (query, provider, lat, lng, detail, geocoded_city, retry_after),
                )
            self.conn.commit()
        except Exception:
            pass


_thread_local = threading.local()


def _get_db_cache() -> GeocodeCache:
    if not hasattr(_thread_local, "cache"):
        _thread_local.cache = GeocodeCache()
    return _thread_local.cache


def _geocode_key(name: str, location: str | None, street: str | None = None) -> str:
    parts = [name or ""]
    if street:
        parts.append(street)
    if location:
        parts.append(location)
    return "|".join(p.strip().lower() for p in parts)


# When a comment omits the city (common in city-specific subreddits like r/Anaheim,
# where the city is implied), fall back to the subreddit's city as a geocoding hint.
# County-wide subs (orangecounty) have no single city and are intentionally absent → no fallback.
SUBREDDIT_CITY = {
    "anaheim": "Anaheim", "santaana": "Santa Ana", "irvine": "Irvine",
    "huntingtonbeach": "Huntington Beach", "gardengrove": "Garden Grove", "fullerton": "Fullerton",
    "costamesa": "Costa Mesa", "missionviejo": "Mission Viejo", "westminster": "Westminster",
    "newportbeach": "Newport Beach", "lagunabeach": "Laguna Beach", "tustin": "Tustin",
    "orange": "Orange", "orangeca": "Orange", "cityoforange": "Orange",
    "lakeforest": "Lake Forest", "sanclemente": "San Clemente", "buenapark": "Buena Park",
    "lahabra": "La Habra", "fountainvalley": "Fountain Valley", "yorbalinda": "Yorba Linda",
    "danapoint": "Dana Point", "alisoviejo": "Aliso Viejo", "ranchosantamargarita": "Rancho Santa Margarita",
    "lagunaniguel": "Laguna Niguel", "lagunahills": "Laguna Hills", "lagunawoods": "Laguna Woods",
    "brea": "Brea", "placentia": "Placentia", "cypress": "Cypress",
    "sanjuancapistrano": "San Juan Capistrano", "sealbeach": "Seal Beach", "stanton": "Stanton",
    "losalamitos": "Los Alamitos", "villapark": "Villa Park", "lapalma": "La Palma",
    # unincorporated communities
    "laderaranch": "Ladera Ranch", "cotodecaza": "Coto de Caza", "rossmoor": "Rossmoor",
    "northtustin": "North Tustin", "midwaycity": "Midway City", "trabucocanyon": "Trabuco Canyon",
    "silverado": "Silverado Canyon", "sunsetbeach": "Sunset Beach",
    # campuses → nearest city
    "uci": "Irvine", "csuf": "Fullerton", "calstatefullerton": "Fullerton",
    "chapman": "Orange", "saddleback": "Mission Viejo",
    # orangecounty: intentionally omitted (county-wide → no fallback)
}


def _subreddit_city(subreddit: str | None) -> str | None:
    """City to use as a geocoding hint when a comment doesn't name one (city subreddits)."""
    return SUBREDDIT_CITY.get((subreddit or "").strip().lower())


# Canonical OC city names + aliases for normalizing a free-text "location" before
# geocoding: expand abbreviations ("HB"), partials ("Newport"), neighborhoods/streets
# ("Old Town Tustin", "Anaheim Blvd"), and multi-city strings ("Santa Ana/Garden Grove").
# Hard-coded so the pipeline never silently accepts a new made-up "city" name.
_OC_CITIES: list[str] = sorted(
    [
        # 34 officially incorporated OC cities (source: ocgov.com)
        "Aliso Viejo", "Anaheim", "Brea", "Buena Park", "Costa Mesa", "Cypress",
        "Dana Point", "Fountain Valley", "Fullerton", "Garden Grove",
        "Huntington Beach", "Irvine", "La Habra", "La Palma", "Laguna Beach",
        "Laguna Hills", "Laguna Niguel", "Laguna Woods", "Lake Forest",
        "Los Alamitos", "Mission Viejo", "Newport Beach", "Orange", "Placentia",
        "Rancho Santa Margarita", "San Clemente", "San Juan Capistrano",
        "Santa Ana", "Seal Beach", "Stanton", "Tustin", "Villa Park",
        "Westminster", "Yorba Linda",
        # unincorporated communities, master-planned areas, and county islands
        # source: OC Planning / community plans
        "Anaheim Hills", "Bolsa Chica", "Corona del Mar", "Coto de Caza",
        "El Modena", "Emerald Bay", "Foothill Ranch", "Las Flores",
        "Ladera Ranch", "Midway City", "Modjeska Canyon", "North Tustin",
        "Olive Heights", "Orange Park Acres", "Rancho Mission Viejo", "Rossmoor",
        "Santa Ana Heights", "Santiago Canyon", "Silverado Canyon",
        "Sunset Beach", "Trabuco Canyon", "Wagon Wheel",
        # major landmarks, malls, and hubs (geocoding hints)
        "South Coast Plaza", "Fashion Island", "Irvine Spectrum", "The Lab",
        "The Camp", "Pacific City", "Old Towne Orange", "Downtown Disney",
        "Anaheim Packing District", "Lido Marina Village", "SoCo",
        # nearby LA-county cities that appear in OC food discussions
        "Artesia", "Cerritos", "Long Beach", "Norwalk",
    ],
    key=len,
    reverse=True,  # match longer names first ("Anaheim Hills" before "Anaheim")
)
_LOCATION_ALIASES: dict[str, str] = {
    # common abbreviations
    "hb": "Huntington Beach", "cm": "Costa Mesa", "sa": "Santa Ana",
    "sna": "Santa Ana", "fv": "Fountain Valley", "gg": "Garden Grove",
    "cdm": "Corona del Mar", "dp": "Dana Point", "sjc": "San Juan Capistrano",
    "lb": "Long Beach", "mv": "Mission Viejo", "lf": "Lake Forest",
    "rsm": "Rancho Santa Margarita", "bp": "Buena Park",
    # partials / informal names
    "newport": "Newport Beach", "huntington": "Huntington Beach",
    "aliso": "Aliso Viejo", "sanjuan": "San Juan Capistrano",
    "fhr": "Foothill Ranch", "foothillranch": "Foothill Ranch",
    "anaheimhills": "Anaheim Hills",
    # landmarks / hubs
    "spectrum": "Irvine Spectrum", "ocspectrum": "Irvine Spectrum",
    "scp": "South Coast Plaza", "southcoast": "South Coast Plaza",
    "packingdistrict": "Anaheim Packing District",
    "thelab": "The Lab", "thecamp": "The Camp",
    "pacificcity": "Pacific City", "lidomarina": "Lido Marina Village",
    # university campuses → host city
    "uci": "Irvine", "ucitowncenter": "Irvine", "csuf": "Fullerton",
    # landmarks / neighborhoods → city
    "disneyland": "Anaheim", "downtowndisney": "Anaheim",
    "littlearabia": "Anaheim",
    "fashionisland": "Newport Beach", "crystalcove": "Newport Beach",
    # unincorporated community shorthands
    "silverado": "Silverado Canyon", "modjeska": "Modjeska Canyon",
    "trabuco": "Trabuco Canyon",
    "rmv": "Rancho Mission Viejo", "ranchomv": "Rancho Mission Viejo",
    # common OC Reddit neighborhood / landmark shorthands
    "dtsa": "Santa Ana",
    "oldtowneorange": "Orange", "oldtowne": "Orange",
    "southcoastplaza": "Costa Mesa", "scp": "Costa Mesa",
}


def _loc_key(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", s.lower())


def _city_from_address_string(s: str) -> str | None:
    """Return the first recognized OC city/community found in a geocoder address string.

    Works on Nominatim display_name ("Taco Place, Santa Ana, California, ...") and
    Mapbox full_address ("1234 Main St, Santa Ana, CA 92703"). Returns None when no
    known city is present (e.g. an error detail string or an out-of-OC address).
    Iterates _OC_CITIES longest-first so "Rancho Santa Margarita" wins over "Santa Ana".
    """
    if not s:
        return None
    for city in _OC_CITIES:
        if re.search(rf"\b{re.escape(city)}\b", s, re.IGNORECASE):
            return city
    return None


def normalize_location(location: str | None) -> str | None:
    """Normalize a free-text location to a canonical OC city for geocoding.

    Takes the first city of a multi-city string, expands abbreviations/partials, and
    maps a neighborhood/street that names a known city to that city. Returns None for
    unrecognized input — conservative: unmapped is better than an invented city name.
    """
    if not location or not location.strip():
        return None
    first = re.split(r"\s*(?:/|,|&|\bor\b|\band\b)\s*", location.strip(), maxsplit=1)[0].strip()
    if not first:
        return None
    key = _loc_key(first)
    if key in _LOCATION_ALIASES:
        return _LOCATION_ALIASES[key]
    for city in _OC_CITIES:
        if _loc_key(city) == key:
            return city
    low = first.lower()
    for city in _OC_CITIES:
        if re.search(rf"\b{re.escape(city.lower())}\b", low):
            return city
    return None  # unrecognized → unmapped rather than inventing a city name


def _apply_geocode_result(
    restaurant: dict[str, Any],
    lat: float | None,
    lng: float | None,
    geocoded_city: str | None,
    raw_location: str | None,
) -> None:
    restaurant["lat"] = lat
    restaurant["lng"] = lng
    resolved_location = geocoded_city or normalize_location(raw_location)
    if resolved_location is not None:
        restaurant["location"] = resolved_location


# --- Google Places API (New) ------------------------------------------------
GOOGLE_PLACES_URL = "https://places.googleapis.com/v1/places:searchText"
CLOSED_PERMANENTLY_DETAIL = "google: closed permanently"


def _is_closed_permanently_detail(detail: str | None) -> bool:
    return detail == CLOSED_PERMANENTLY_DETAIL


def _in_oc_bounds(lat: float | int | None, lng: float | int | None) -> bool:
    return (
        lat is not None
        and lng is not None
        and 33.3 <= float(lat) <= 34.0
        and -118.2 <= float(lng) <= -117.3
    )


def _google_request(api_key: str, payload: dict[str, Any]) -> list[dict[str, Any]]:
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": api_key,
        "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location,places.businessStatus",
    }
    req = urllib.request.Request(
        GOOGLE_PLACES_URL, data=json.dumps(payload).encode("utf-8"), headers=headers
    )
    with urllib.request.urlopen(req, timeout=10) as response:
        data = json.loads(response.read())
    return data.get("places", [])


def _google_closed_status_lookup(
    api_key: str, name: str, location: str | None, street: str | None
) -> str | None:
    """A final unbounded exact-name probe for closed places that bounded Text Search omits."""
    query_parts = [name]
    if street:
        query_parts.append(street)
    if location:
        query_parts.append(location)
    query_parts.append("CA")
    query = ", ".join(p for p in query_parts if p)

    places = _google_request(api_key, {"textQuery": query})
    if not places:
        return None

    place = places[0]
    loc = place.get("location") or {}
    if (
        place.get("businessStatus") == "CLOSED_PERMANENTLY"
        and _in_oc_bounds(loc.get("latitude"), loc.get("longitude"))
    ):
        return CLOSED_PERMANENTLY_DETAIL
    return None


def _google_geocode(
    name: str, location: str | None, street: str | None
) -> tuple[float | None, float | None, str]:
    api_key = _env_value("GOOGLE_MAPS_API_KEY")
    if not api_key:
        return None, None, "google: no api key"

    query_parts = [name]
    if street:
        query_parts.append(street)
    if location:
        query_parts.append(location)
    query = ", ".join(query_parts) + ", Orange County, CA"

    # OC Bounds for locationRestriction (low and high points)
    # viewbox: "-118.2,33.3,-117.3,34.0"
    payload = {
        "textQuery": query,
        "locationRestriction": {
            "rectangle": {
                "low": {"latitude": 33.3, "longitude": -118.2},
                "high": {"latitude": 34.0, "longitude": -117.3},
            }
        },
    }
    try:
        places = _google_request(api_key, payload)
        if not places:
            closed_detail = _google_closed_status_lookup(api_key, name, location, street)
            if closed_detail:
                return None, None, closed_detail
            return None, None, "google: no results"

        place = places[0]
        if place.get("businessStatus") == "CLOSED_PERMANENTLY":
            return None, None, CLOSED_PERMANENTLY_DETAIL

        lat = place["location"]["latitude"]
        lng = place["location"]["longitude"]
        display_name = f"{place['displayName']['text']}, {place['formattedAddress']}"
        return lat, lng, display_name
    except Exception as exc:
        return None, None, f"google error: {exc}"


# --- Mapbox Search Box fallback ---------------------------------------------
# OSM/Nominatim misses many small OC restaurants (they aren't mapped as POIs).
# When it returns nothing, fall back to Mapbox's POI-rich Search Box API -- but
# Search Box fuzzy-matches and will confidently return the WRONG place, so accept
# a result only when its name strongly matches (token-subset or high ratio) and,
# for weaker matches, the city agrees. Token from env or .env (MAPBOX_TOKEN);
# absent token => fallback silently disabled.
MAPBOX_SEARCHBOX_URL = "https://api.mapbox.com/search/searchbox/v1/forward"
MAPBOX_MIN_INTERVAL_S = 0.2
_last_mapbox_ts = 0.0
_mapbox_lock = threading.Lock()
_mapbox_token_value: str | None = None
_NAME_STOPWORDS = {"the", "a", "and", "restaurant", "cafe", "kitchen", "grill",
                   "grille", "bar", "taqueria", "co", "llc"}


def _mapbox_token() -> str:
    global _mapbox_token_value
    if _mapbox_token_value is None:
        token = os.environ.get("MAPBOX_TOKEN", "")
        env_path = ROOT / ".env"
        if not token and env_path.exists():
            for line in env_path.read_text(encoding="utf-8").splitlines():
                if line.startswith("MAPBOX_TOKEN="):
                    token = line.split("=", 1)[1].strip().strip('"').strip("'")
                    break
        _mapbox_token_value = token or ""
    return _mapbox_token_value


def _name_tokens(s: str) -> set[str]:
    toks = re.sub(r"[^a-z0-9]+", " ", (s or "").lower()).split()
    return {t for t in toks if len(t) >= 2 and t not in _NAME_STOPWORDS}


def _name_score(query_name: str, result_name: str) -> float:
    """0..1 name similarity; a token-subset (query tokens ⊆ result tokens) scores
    high so 'El Indio' matches 'El Indio Botanas y Cerveza'."""
    qk = _loc_key(query_name)
    rk = _loc_key(result_name)
    qt = _name_tokens(query_name)
    subset = bool(qt) and qt <= _name_tokens(result_name)
    subset_score = 0.9 if subset else 0.0

    if _rapidfuzz is not None:
        wratio = _rapidfuzz.WRatio(qk, rk) / 100.0
        token_set = _rapidfuzz.token_set_ratio(qk, rk) / 100.0
        return max(wratio, token_set, subset_score)

    ratio = difflib.SequenceMatcher(None, qk, rk).ratio()
    return max(ratio, subset_score)


def _mapbox_accept(query_name: str, city_key: str, feat_name: str, feat_addr: str) -> bool:
    """Accept a Mapbox candidate only on a strong name match, or a decent name
    match confirmed by the city -- the gate that blocks fuzzy false positives."""
    score = _name_score(query_name, feat_name)
    city_match = bool(city_key) and city_key in _loc_key(feat_addr)
    return score >= 0.85 or (score >= 0.6 and city_match)


def _mapbox_pick(cands: list, query_name: str, city_key: str):
    """Choose among in-OC candidates: prefer one whose city matches the query (so a
    multi-branch chain resolves to the right city), else the best name match."""
    if not cands:
        return None
    scored = [(_name_score(query_name, f[2]), bool(city_key) and city_key in _loc_key(f[3]), f)
              for f in cands]
    city_hits = [s for s in scored if s[0] >= 0.6 and s[1]]
    pool = city_hits or scored
    return max(pool, key=lambda s: s[0])[2]


def _mapbox_geocode(name: str, location: str) -> tuple[float | None, float | None, str]:
    token = _mapbox_token()
    if not token:
        return None, None, "mapbox: no token"
    params = urllib.parse.urlencode({
        "q": f"{name} {location}",
        "access_token": token,
        "proximity": "-117.8,33.7",
        "bbox": OC_BOUNDS["viewbox"],
        "types": "poi",
        "limit": "5",
    })
    global _last_mapbox_ts
    with _mapbox_lock:
        wait = MAPBOX_MIN_INTERVAL_S - (time.monotonic() - _last_mapbox_ts)
        if wait > 0:
            time.sleep(wait)
        _last_mapbox_ts = time.monotonic()

    try:
        with urllib.request.urlopen(f"{MAPBOX_SEARCHBOX_URL}?{params}", timeout=10) as response:
            data = json.loads(response.read())
    except Exception as exc:
        return None, None, f"mapbox error: {exc}"  # transient -> not cached

    city_key = _loc_key(location)
    cands = []
    for feat in data.get("features") or []:
        coords = (feat.get("geometry") or {}).get("coordinates") or [None, None]
        lng, lat = coords[0], coords[1]
        if lat is None or not (33.3 <= lat <= 34.0 and -118.2 <= lng <= -117.3):
            continue
        props = feat.get("properties") or {}
        fname = props.get("name", "")
        faddr = props.get("full_address", "") or props.get("place_formatted", "") or ""
        cands.append((lat, lng, fname, faddr))
    best = _mapbox_pick(cands, name, city_key)
    if not best:
        return None, None, "mapbox: no in-OC result"
    lat, lng, fname, faddr = best
    if _mapbox_accept(name, city_key, fname, faddr):
        return lat, lng, f"mapbox: {fname}, {faddr}"
    return None, None, f"mapbox: rejected ({fname})"


def default_geocode(
    name: str,
    location: str | None,
    street: str | None = None,
    *,
    allow_name_only: bool = False,
) -> tuple[float | None, float | None, str, str | None]:
    """Geocode a restaurant by name + location hint + optional street.

    Returns (lat, lng, detail, geocoded_city) where geocoded_city is the canonical
    OC city/community extracted from the geocoder's address string, or None when
    geocoding fails or the result address doesn't contain a recognized OC place.

    Tiered provider logic:
    1. Google Places API (New) - High precision, POI-rich.
    2. Nominatim (OpenStreetMap) - Good coverage, free.
    3. Mapbox Search Box - Fallback for small spots.
    """
    normalized_loc = normalize_location(location)
    if not normalized_loc and not allow_name_only:
        return None, None, "missing location", None

    cache = _get_db_cache()
    query_key = _geocode_key(name, normalized_loc, street)
    cached = cache.get(query_key)
    if cached:
        lat, lng, detail, city = cached
        return lat, lng, detail, city

    # Tier 1: Google
    lat, lng, detail = _google_geocode(name, normalized_loc, street)
    provider = "google"

    # Tier 2: Nominatim
    if lat is None and not _is_closed_permanently_detail(detail):
        query = (
            f"{name}, {street}, {normalized_loc}, Orange County, CA"
            if street and normalized_loc
            else f"{name}, {street or normalized_loc}, Orange County, CA"
        )
        params = urllib.parse.urlencode(
            {
                "q": query,
                "format": "json",
                "limit": "1",
                "countrycodes": "us",
                **OC_BOUNDS,
            }
        )
        request = urllib.request.Request(f"{NOMINATIM_URL}?{params}", headers=HEADERS)

        # Rate limit Nominatim (shared across threads via global _last_geocode_ts)
        global _last_geocode_ts
        with _nominatim_lock:
            wait = GEOCODE_MIN_INTERVAL_S - (time.monotonic() - _last_geocode_ts)
            if wait > 0:
                time.sleep(wait)
            _last_geocode_ts = time.monotonic()

            try:
                with urllib.request.urlopen(request, timeout=10) as response:
                    results = json.loads(response.read())
                    if results:
                        hit = results[0]
                        n_lat = float(hit["lat"])
                        n_lng = float(hit["lon"])
                        dname = hit.get("display_name", "")
                        if 33.3 <= n_lat <= 34.0 and -118.2 <= n_lng <= -117.3:
                            lat, lng, detail = n_lat, n_lng, dname
                            provider = "nominatim"
            except Exception as exc:
                detail = f"nominatim error: {exc}"

    # Tier 3: Mapbox
    if lat is None and not _is_closed_permanently_detail(detail):
        mb_lat, mb_lng, mb_detail = _mapbox_geocode(name, normalized_loc or "")
        if mb_lat is not None:
            lat, lng, detail = mb_lat, mb_lng, mb_detail
            provider = "mapbox"

    result = (lat, lng, detail)
    geocoded_city = _city_from_address_string(detail) if lat is not None else None

    # Negative caching is handled in cache.set()
    cache.set(query_key, result, provider, geocoded_city)

    return lat, lng, detail, geocoded_city


def build_thread(
    thread_dir: Path,
    extract_entities_fn: Callable[..., Any] = default_extract_entities,
    geocode_fn: Callable[..., tuple[float | None, float | None, str, str | None]] = default_geocode,
) -> dict[str, Any]:
    manifest_path = thread_dir / "manifest.json"
    raw_html_path = thread_dir / "raw" / "thread.html"
    raw_json_path = thread_dir / "raw" / "thread.json"
    processed_dir = thread_dir / "processed"
    review_dir = thread_dir / "review"

    manifest = load_json(manifest_path)
    if manifest is None:
        raise FileNotFoundError(f"Missing manifest: {manifest_path}")
    
    if raw_json_path.exists():
        reddit_json = load_json(raw_json_path)
        parsed_thread = parse_reddit_json(reddit_json)
    elif raw_html_path.exists():
        parsed_thread = parse_saved_reddit_html(raw_html_path)
    else:
        raise FileNotFoundError(f"Missing raw data: neither {raw_html_path} nor {raw_json_path} found")

    comments_flat = flatten_comment_tree(parsed_thread["comments"])

    write_json(processed_dir / "thread.json", parsed_thread)
    write_jsonl(processed_dir / "comments_flat.jsonl", comments_flat)

    roots = [comment for comment in comments_flat if comment["depth"] == 0]
    entity_records: list[dict[str, Any]] = []
    for root in roots:
        entities, raw = normalize_extractor_result(
            extract_entities_fn(root["body"], comment=root, manifest=manifest)
        )
        entity_records.append(
            {
                "comment_id": root["id"],
                "entities": entities,
                "raw": raw,
            }
        )
    write_jsonl(processed_dir / "entities.jsonl", entity_records)

    thread_dataset = build_thread_dataset(parsed_thread, entity_records)
    write_json(processed_dir / "restaurants.thread.json", thread_dataset)

    geocoded_count = 0
    unresolved: list[dict[str, Any]] = []
    restaurants = copy.deepcopy(thread_dataset["restaurants"])

    def _geocode_worker(r):
        raw_loc = r.get("location") or _subreddit_city(manifest["subreddit"])
        street = r.get("street")
        return geocode_fn(r["name"], raw_loc, street)

    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
        futures = {executor.submit(_geocode_worker, r): r for r in restaurants}
        for future in concurrent.futures.as_completed(futures):
            r = futures[future]
            try:
                lat, lng, detail, geocoded_city = future.result()
                r["geocode_detail"] = detail
                if _is_closed_permanently_detail(detail):
                    continue
                raw_loc = r.get("location") or _subreddit_city(manifest["subreddit"])
                _apply_geocode_result(r, lat, lng, geocoded_city, raw_loc)
                if lat is not None and lng is not None:
                    geocoded_count += 1
                else:
                    unresolved.append(
                        {
                            "name": r["name"],
                            "location": r.get("location"),
                            "street": r.get("street"),
                            "cuisine": r.get("cuisine"),
                            "reason": detail,
                        }
                    )
            except Exception as exc:
                print(f"Error geocoding {r['name']}: {exc}", file=sys.stderr)

    geocoded_dataset = {
        "restaurants": [
            r for r in restaurants
            if not _is_closed_permanently_detail(r.get("geocode_detail"))
        ],
        "meta": {
            **thread_dataset["meta"],
            "geocoded_count": geocoded_count,
            "unmapped_count": len(unresolved),
        },
    }
    write_json(processed_dir / "restaurants.geocoded.json", geocoded_dataset)
    write_json(review_dir / "unresolved.json", unresolved)

    manifest["comment_count"] = parsed_thread["comment_count"]
    manifest["max_depth"] = parsed_thread["max_depth"]
    write_json(manifest_path, manifest)
    return geocoded_dataset


def write_to_db(
    parsed_thread: dict[str, Any],
    restaurants_with_geocodes: list[dict[str, Any]],
    manifest: dict[str, Any],
    *,
    connection_factory: Callable[[str], Any] | None = None,
) -> dict[str, int]:
    """Persist a freshly-ingested thread + restaurants + mentions to Postgres.

    Single transaction. Idempotent (upserts by primary key / unique slug /
    unique (thread_id, comment_id)). Returns counts for the caller.

    `connection_factory` is an injection point for tests; defaults to
    `psycopg.connect`.
    """
    if connection_factory is None:
        if psycopg is None:
            raise RuntimeError(
                "psycopg is not installed. Run: pip install 'psycopg[binary]>=3.2'"
            )
        connection_factory = psycopg.connect

    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        raise RuntimeError("DATABASE_URL is not set; cannot write to Postgres")

    thread_id = manifest["id"]
    restaurants_with_geocodes = [
        restaurant for restaurant in restaurants_with_geocodes
        if not _is_closed_permanently_detail(restaurant.get("geocode_detail"))
    ]

    restaurants_inserted = 0
    mentions_inserted = 0
    inserted_mention_ids = []

    with connection_factory(database_url) as conn:
        with conn.cursor() as cur:
            # 1. Threads — upsert from manifest
            cur.execute(
                """
                INSERT INTO threads (id, subreddit, post_id, url, title, comment_count, max_depth, included_in_publish)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (id) DO UPDATE SET
                    subreddit = EXCLUDED.subreddit,
                    post_id = EXCLUDED.post_id,
                    url = EXCLUDED.url,
                    title = EXCLUDED.title,
                    comment_count = EXCLUDED.comment_count,
                    max_depth = EXCLUDED.max_depth,
                    included_in_publish = EXCLUDED.included_in_publish
                """,
                (
                    thread_id,
                    manifest["subreddit"],
                    manifest["post_id"],
                    manifest["url"],
                    manifest["title"],
                    manifest.get("comment_count", parsed_thread.get("comment_count", 0)),
                    manifest.get("max_depth", parsed_thread.get("max_depth", 0)),
                    manifest.get("include_in_publish", True),
                ),
            )

            # Fetch existing restaurants for cross-thread deduplication
            cur.execute("SELECT name, slug, location, street, lat, lng FROM restaurants")
            # psycopg 3 cursor returns tuples by default unless a row_factory is used.
            # We use column indices to ensure compatibility with any row_factory.
            desc = cur.description
            col_name = {d[0]: i for i, d in enumerate(desc)} if desc else {}

            existing = []
            for row in cur.fetchall():
                if isinstance(row, dict):
                    existing.append(row)
                else:
                    existing.append({
                        "name": row[col_name["name"]],
                        "slug": row[col_name["slug"]],
                        "location": row[col_name["location"]],
                        "street": row[col_name["street"]],
                        "lat": row[col_name["lat"]],
                        "lng": row[col_name["lng"]]
                    })

            # 2. Restaurants — collapse batch duplicates, assign slugs, upsert
            deduped_restaurants = collapse_duplicate_restaurants(restaurants_with_geocodes)
            for restaurant, slug in assign_slugs(deduped_restaurants, existing=existing):
                cur.execute(
                    """
                    INSERT INTO restaurants (name, slug, location, street, cuisine, lat, lng)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (slug) DO UPDATE SET
                        name = CASE WHEN length(EXCLUDED.name) > length(restaurants.name) THEN EXCLUDED.name ELSE restaurants.name END,
                        location = COALESCE(restaurants.location, EXCLUDED.location),
                        street = COALESCE(restaurants.street, EXCLUDED.street),
                        cuisine = COALESCE(restaurants.cuisine, EXCLUDED.cuisine),
                        lat = COALESCE(restaurants.lat, EXCLUDED.lat),
                        lng = COALESCE(restaurants.lng, EXCLUDED.lng),
                        updated_at = now()
                    RETURNING id
                    """,
                    (
                        restaurant["name"],
                        slug,
                        restaurant.get("location"),
                        restaurant.get("street"),
                        restaurant.get("cuisine"),
                        restaurant.get("lat"),
                        restaurant.get("lng"),
                    ),
                )
                row = cur.fetchone()
                if not row:
                    raise RuntimeError(
                        f"INSERT did not return a row for {restaurant['name']!r}"
                    )
                # `row` may be a tuple (default psycopg cursor) or a dict (dict_row).
                restaurant_id = row[0] if isinstance(row, (tuple, list)) else row["id"]
                restaurants_inserted += 1

                # 3. Primary mention(s) — role='primary', classification NULL
                primary_comments = restaurant.get("primary_comments") or [restaurant["primary_comment"]]
                for primary in primary_comments:
                    cur.execute(
                        """
                        INSERT INTO mentions (restaurant_id, thread_id, comment_id, permalink, author, body, score, role, classification, comment_date)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, 'primary', NULL, %s)
                        ON CONFLICT (thread_id, comment_id, restaurant_id) DO UPDATE SET
                            restaurant_id = EXCLUDED.restaurant_id,
                            permalink = EXCLUDED.permalink,
                            author = EXCLUDED.author,
                            body = EXCLUDED.body,
                            score = EXCLUDED.score,
                            comment_date = EXCLUDED.comment_date
                        RETURNING id
                        """,
                        (
                            restaurant_id,
                            thread_id,
                            primary["id"],
                            primary.get("permalink"),
                            primary["author"],
                            primary["body"],
                            primary["score"],
                            parse_comment_date(primary.get("created_utc")),
                        ),
                    )
                    row = cur.fetchone()
                    if row:
                        inserted_mention_ids.append(row[0] if isinstance(row, (tuple, list)) else row["id"])
                    mentions_inserted += 1

                # 4. Endorsements — role='endorsement', classification=<type>
                # Fresh ingests carry real comment_ids and permalinks (propagated
                # via collect_endorsements + build_thread_dataset).
                for endorsement in restaurant.get("endorsements", []):
                    cur.execute(
                        """
                        INSERT INTO mentions (restaurant_id, thread_id, comment_id, permalink, author, body, score, role, classification, comment_date)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, 'endorsement', %s, %s)
                        ON CONFLICT (thread_id, comment_id, restaurant_id) DO UPDATE SET
                            restaurant_id = EXCLUDED.restaurant_id,
                            permalink = EXCLUDED.permalink,
                            author = EXCLUDED.author,
                            body = EXCLUDED.body,
                            score = EXCLUDED.score,
                            classification = EXCLUDED.classification,
                            comment_date = EXCLUDED.comment_date
                        RETURNING id
                        """,
                        (
                            restaurant_id,
                            thread_id,
                            endorsement["id"],
                            endorsement.get("permalink"),
                            endorsement["author"],
                            endorsement["body"],
                            endorsement["score"],
                            endorsement.get("type"),
                            parse_comment_date(endorsement.get("created_utc")),
                        ),
                    )
                    row = cur.fetchone()
                    if row:
                        inserted_mention_ids.append(row[0] if isinstance(row, (tuple, list)) else row["id"])
                    mentions_inserted += 1

            if inserted_mention_ids:
                cur.execute(
                    "DELETE FROM mentions WHERE thread_id = %s AND id != ALL(%s)",
                    (thread_id, inserted_mention_ids)
                )
            else:
                cur.execute(
                    "DELETE FROM mentions WHERE thread_id = %s",
                    (thread_id,),
                )

        conn.commit()

    print(
        f"inserted {restaurants_inserted} restaurants, {mentions_inserted} mentions across thread {thread_id}"
    )
    return {
        "restaurants": restaurants_inserted,
        "mentions": mentions_inserted,
        "thread_id": thread_id,
    }


def _emit_progress(event: dict[str, Any]) -> None:
    """Emit a JSON-lines progress event to stdout (consumed by the SSE endpoint)."""
    tqdm.tqdm.write(json.dumps(event), file=sys.stdout)


def ingest(
    html_path: Path,
    *,
    limit: int | None = None,
    dry_run: bool = False,
    extract_entities_fn: Callable[..., Any] = default_extract_entities,
    geocode_fn: Callable[..., tuple[float | None, float | None, str, str | None]] = default_geocode,
) -> dict[str, Any]:
    """Parse a saved Reddit thread HTML export -> extract -> geocode -> DB write.

    No network access. The operator exports the thread as HTML from a browser
    (expanding "load more comments" first for full coverage) and points the CLI
    at the file. ``limit`` truncates extraction to the first N top-level comments
    (handy for a quick test run before processing the whole thread).
    """
    html_path = Path(html_path)
    _emit_progress(
        {"stage": "parse", "progress": 0.0, "message": f"parsing {html_path.name}..."}
    )
    parsed_thread = parse_saved_reddit_html(html_path)
    manifest = manifest_from_parsed_thread(parsed_thread["post"]["url"], parsed_thread)
    _emit_progress(
        {
            "stage": "parse",
            "progress": 1.0,
            "message": f"parsed {parsed_thread['comment_count']} comments",
            "thread_id": manifest["id"],
        }
    )

    comments_flat = flatten_comment_tree(parsed_thread["comments"])
    roots = [comment for comment in comments_flat if comment["depth"] == 0]
    if limit is not None and limit > 0:
        roots = roots[:limit]
    total_roots = len(roots) or 1

    entity_records: list[dict[str, Any]] = []
    # Wrap in tqdm for CLI feedback, but disable when stderr is not a TTY (e.g. web UI stream).
    for index, root in enumerate(
        tqdm.tqdm(
            roots,
            desc="Extracting",
            unit="comment",
            disable=not sys.stderr.isatty(),
        ),
        start=1,
    ):
        entities, raw = normalize_extractor_result(
            extract_entities_fn(root["body"], comment=root, manifest=manifest)
        )
        entity_records.append(
            {
                "comment_id": root["id"],
                "entities": entities,
                "raw": raw,
            }
        )
        _emit_progress(
            {
                "stage": "extract",
                "progress": round(index / total_roots, 2),
                "message": f"extracted entities from comment {index}/{total_roots}",
                "comment_id": root["id"],
                "entity_count": len(entities),
            }
        )

    thread_dataset = build_thread_dataset(parsed_thread, entity_records)
    restaurants = copy.deepcopy(thread_dataset["restaurants"])
    total_restaurants = len(restaurants) or 1

    for index, restaurant in enumerate(
        tqdm.tqdm(
            restaurants,
            desc="Geocoding",
            unit="restaurant",
            disable=not sys.stderr.isatty(),
        ),
        start=1,
    ):
        raw_location = restaurant.get("location") or _subreddit_city(manifest["subreddit"])
        lat, lng, detail, geocoded_city = geocode_fn(restaurant["name"], raw_location, restaurant.get("street"))
        _apply_geocode_result(restaurant, lat, lng, geocoded_city, raw_location)
        _emit_progress(
            {
                "stage": "geocode",
                "progress": round(index / total_restaurants, 2),
                "message": f"geocoded {restaurant['name']} ({index}/{total_restaurants})",
                "name": restaurant["name"],
                "resolved": lat is not None and lng is not None,
                "detail": detail,
            }
        )

    if dry_run:
        _emit_progress(
            {
                "stage": "write",
                "progress": 1.0,
                "message": "dry-run: skipping DB write",
                "dry_run": True,
            }
        )
        result = {
            "thread_id": manifest["id"],
            "restaurants": len(restaurants),
            "mentions": sum(1 + len(r.get("endorsements", [])) for r in restaurants),
        }
    else:
        _emit_progress(
            {"stage": "write", "progress": 0.0, "message": "writing to Postgres..."}
        )
        result = write_to_db(parsed_thread, restaurants, manifest)
        _emit_progress(
            {
                "stage": "write",
                "progress": 1.0,
                "message": "DB write complete",
                **result,
            }
        )

    _emit_progress(
        {
            "stage": "done",
            "thread_id": manifest["id"],
            "restaurants": result["restaurants"],
            "mentions": result["mentions"],
        }
    )
    return {
        "thread_id": manifest["id"],
        "restaurants": result["restaurants"],
        "mentions": result["mentions"],
        "manifest": manifest,
    }


def _archive_ingested_html(html_path: Path) -> Path:
    """Move a successfully-ingested HTML file into THREADS_ROOT (flat)."""
    THREADS_ROOT.mkdir(parents=True, exist_ok=True)
    dest = THREADS_ROOT / html_path.name
    shutil.move(str(html_path), str(dest))
    return dest


def ingest_batch(
    *, limit: int | None = None, dry_run: bool = False, archive: bool = True
) -> int:
    """Ingest every ``*.html`` file in UNINGESTED_ROOT, archiving each on success.

    On a per-file error the file is left in place and the loop continues to the
    next file. Returns a non-zero exit code if any file failed.
    """
    files = sorted(UNINGESTED_ROOT.glob("*.html"))
    if not files:
        print(f"No .html files found in {UNINGESTED_ROOT}")
        return 0
    failures = 0
    pbar = tqdm.tqdm(files, desc="Batch Ingesting", unit="file", disable=not sys.stderr.isatty())
    for html_path in pbar:
        pbar.set_postfix_str(html_path.name)
        try:
            ingest(html_path, limit=limit, dry_run=dry_run)
            if not dry_run and archive:
                dest = _archive_ingested_html(html_path)
        except Exception as exc:  # skip + continue to the next file
            failures += 1
            print(f"ERROR ingesting {html_path.name}: {exc}", file=sys.stderr)
    return 1 if failures else 0


def reingest_all(
    *, limit: int | None = None, dry_run: bool = False, confirmed: bool = False
) -> int:
    """Back up, purge, and re-ingest every archived thread HTML file.

    Steps (when not dry-run):
      1. Discover HTML files: prefer THREADS_ROOT, fall back to UNINGESTED_ROOT.
      2. Create a DB backup via db_backup.backup().
      3. Move files from THREADS_ROOT -> UNINGESTED_ROOT (if sourced from THREADS_ROOT).
      4. TRUNCATE threads, restaurants, and mentions.
      5. Ingest each file; archive it back to THREADS_ROOT on success.
         Stops on the first failure and prints the restore command.

    Requires ``confirmed=True`` (``--yes``) to perform any destructive steps.
    """
    import db_backup as b  # local import — db_backup is a sibling script, not a package dep

    # Discover files: prefer threads/, fall back to uningested-threads/.
    html_files = sorted(THREADS_ROOT.glob("*.html"))
    source = THREADS_ROOT
    if not html_files:
        html_files = sorted(UNINGESTED_ROOT.glob("*.html"))
        source = UNINGESTED_ROOT

    if not html_files:
        print(f"No .html files found in {THREADS_ROOT} or {UNINGESTED_ROOT}.")
    else:
        if source == UNINGESTED_ROOT:
            print(f"No .html files in {THREADS_ROOT}; using {UNINGESTED_ROOT} instead.")
        print(f"Found {len(html_files)} thread HTML file(s) in {source}:")
        for p in html_files:
            print(f"  {p.name}")

    if dry_run:
        print("Dry run — no backup, purge, or ingest performed.")
        return 0

    if not confirmed:
        print("Refusing to modify the database without --yes.", file=sys.stderr)
        return 2

    if not html_files:
        return 0

    print("\nCreating database backup...")
    backup_path = b.backup()
    print(f"Backup saved: {backup_path}")

    # If files are archived in threads/, stage them into uningested-threads/ first.
    if source == THREADS_ROOT:
        UNINGESTED_ROOT.mkdir(parents=True, exist_ok=True)
        staged = 0
        for src in html_files:
            dest = UNINGESTED_ROOT / src.name
            if dest.exists():
                print(f"Skipping {src.name}: already present in uningested-threads/")
                continue
            shutil.move(str(src), str(dest))
            staged += 1
        html_files = [UNINGESTED_ROOT / p.name for p in html_files if (UNINGESTED_ROOT / p.name).exists()]
        print(f"Staged {staged} thread(s) into uningested-threads/.")

    print("\nPurging ingest tables...")
    conn = b._connect()
    try:
        with conn.cursor() as cur:
            cur.execute("TRUNCATE mentions, restaurants, threads RESTART IDENTITY CASCADE")
        conn.commit()
    finally:
        conn.close()
    print("Purge complete.")

    print()
    successes: list[str] = []
    pbar = tqdm.tqdm(html_files, desc="Re-ingesting", unit="thread")
    for html_path in pbar:
        pbar.set_postfix_str(html_path.name)
        try:
            ingest(html_path, limit=limit)
            _archive_ingested_html(html_path)
        except Exception as exc:
            pbar.close()
            print(f"\nERROR ingesting {html_path.name}: {exc}", file=sys.stderr)
            print(
                f"\nIngest stopped after {len(successes)} success(es). "
                f"Restore from backup:\n"
                f"  python3 scripts/db_backup.py restore {backup_path}",
                file=sys.stderr,
            )
            return 1
        successes.append(html_path.name)
        tqdm.tqdm.write(f"  OK: {html_path.name}")

    print(
        f"\nRe-ingest complete: {len(successes)}/{len(html_files)} thread(s). "
        f"Backup: {backup_path}"
    )
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="OC Food Recs Reddit ingestion pipeline")
    subparsers = parser.add_subparsers(dest="command", required=True)

    init_parser = subparsers.add_parser("init-thread", help="Create a thread folder from a saved Reddit HTML file")
    init_parser.add_argument("--html", required=True, type=Path)

    build_parser = subparsers.add_parser("build-thread", help="Parse, extract, and geocode one saved Reddit thread")
    build_parser.add_argument("--thread", required=True)

    ingest_parser = subparsers.add_parser(
        "ingest",
        help="Parse a saved Reddit thread HTML export and write directly to Postgres",
    )
    ingest_parser.add_argument(
        "--html",
        type=Path,
        default=None,
        help=(
            "Path to a saved Reddit thread HTML file. "
            "If omitted, every *.html file in ./data/uningested-threads/ is ingested."
        ),
    )
    ingest_parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Process only the first N top-level comments (useful for testing)",
    )
    ingest_parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Run parse/extract/geocode and emit progress events but skip the DB write",
    )
    ingest_parser.add_argument(
        "--no-archive",
        action="store_true",
        help=(
            "Do not move the HTML file into ./data/threads/ after a successful ingest. "
            "Used by callers (e.g. the admin upload route) that manage their own temp files."
        ),
    )

    reingest_parser = subparsers.add_parser(
        "reingest",
        help=(
            "Re-ingest all previously archived threads. Moves every *.html file from "
            "./data/threads/ back into ./data/uningested-threads/, then runs a full "
            "ingest pass. Successfully re-ingested files are archived back to "
            "./data/threads/; failures stay in ./data/uningested-threads/ for inspection."
        ),
    )
    reingest_parser.add_argument(
        "--yes",
        action="store_true",
        help="Required to perform backup, purge, and ingest (safety gate)",
    )
    reingest_parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Process only the first N top-level comments per thread (useful for testing)",
    )
    reingest_parser.add_argument(
        "--dry-run",
        action="store_true",
        help="List files without backup, purge, or ingest",
    )

    args = parser.parse_args(argv)

    if args.command == "init-thread":
        thread_dir = init_thread(args.html)
        print(thread_dir)
        return 0

    if args.command == "build-thread":
        thread_dir = THREADS_ROOT / args.thread
        result = build_thread(thread_dir)
        print(json.dumps(result["meta"], indent=2))
        return 0

    if args.command == "ingest":
        if args.html is None:
            return ingest_batch(
                limit=args.limit, dry_run=args.dry_run, archive=not args.no_archive
            )
        ingest(args.html, limit=args.limit, dry_run=args.dry_run)
        if not args.dry_run and not args.no_archive:
            _archive_ingested_html(args.html)
        return 0

    if args.command == "reingest":
        return reingest_all(limit=args.limit, dry_run=args.dry_run, confirmed=args.yes)

    parser.error(f"Unknown command: {args.command}")
    return 2


if __name__ == "__main__":
    sys.exit(main())
