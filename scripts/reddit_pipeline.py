#!/usr/bin/env python3
from __future__ import annotations

import argparse
import copy
import difflib
import html as html_mod
import json
import os
import re
import shutil
import sys
import time
import urllib.parse
import urllib.request
from collections import defaultdict
from datetime import datetime, timezone
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


ROOT = Path(__file__).resolve().parents[1]
DATA_ROOT = ROOT / "data"
THREADS_ROOT = DATA_ROOT / "threads"
UNINGESTED_ROOT = DATA_ROOT / "uningested-threads"
GEOCODE_CACHE_PATH = DATA_ROOT / "geocode-cache.json"
GEOCODE_MIN_INTERVAL_S = 1.05  # Nominatim usage policy: max ~1 request/second

# Lazily-loaded persistent geocode cache + last-request timestamp for throttling.
# Keyed by normalized (name, location) so repeat restaurants across threads are free.
_geocode_cache: dict[str, list] | None = None
_last_geocode_ts = 0.0

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
- "cuisine": cuisine type if inferable from the name or text, else null

Include any food or drink establishment (restaurants, cafes, bakeries, ice cream shops, delis, food trucks, etc.).
A proper name IS a recommendation even if it does not sound food-related and even if it is terse: a bare name ("Keno's") or "Name in City" ("Pops in Santa Ana") must be extracted.
Infer cuisine when the name or text makes it clear: "Peter's Burgers" -> Burgers, "Pho 79" -> Vietnamese, "Tama Sushi" -> Sushi, "El Farolito" -> Mexican, "Gina's Pizza" -> Pizza. Use null only when genuinely unclear.
Do NOT invent names from generic phrases: "a wine tasting place", "a taco truck", "that breakfast spot" are not names -- skip them unless a proper name is given.
Expand common Orange County abbreviations: HB = Huntington Beach, CM = Costa Mesa, SA/SNA = Santa Ana, FV = Fountain Valley, GG = Garden Grove, CdM = Corona del Mar, DP = Dana Point, SJC = San Juan Capistrano, LB = Long Beach, MV = Mission Viejo, LF = Lake Forest, RSM = Rancho Santa Margarita.

If the comment is NOT recommending any food/drink establishment (e.g., a question, a meta comment, or only a closed/defunct place being reminisced about), return an empty array [].

Examples:
Comment: "Pops in Santa Ana"
JSON: [{"name": "Pops", "location": "Santa Ana", "cuisine": null}]
Comment: "Peter's Burgers in Tustin, best patty melt around"
JSON: [{"name": "Peter's Burgers", "location": "Tustin", "cuisine": "Burgers"}]
Comment: "Anyone know a good taco truck around here?"
JSON: []

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
        if keyword in low:
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
                "location": normalize_text(str(entity["location"])) if entity.get("location") else None,
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


def normalize_name(name: str) -> str:
    normalized = name.lower().strip()
    normalized = re.sub(r"['’]s$", "", normalized)
    normalized = re.sub(r"[^\w\s&]", "", normalized)
    normalized = re.sub(r"\s+", " ", normalized).strip()
    return normalized


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

    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for entry in raw_entries:
        groups[normalize_name(entry["name"])].append(entry)

    restaurants: list[dict[str, Any]] = []
    for entries in groups.values():
        entries.sort(key=lambda entry: entry["score"], reverse=True)
        primary = entries[0]

        all_endorsements: list[dict[str, Any]] = []
        seen_endorsements: set[tuple[str, str, str]] = set()
        for entry in entries:
            for endorsement in entry["endorsements"]:
                dedupe_key = (
                    endorsement["type"],
                    endorsement["author"],
                    endorsement["body"].strip(),
                )
                if dedupe_key in seen_endorsements:
                    continue
                seen_endorsements.add(dedupe_key)
                all_endorsements.append(endorsement)

        all_endorsements.sort(key=lambda endorsement: endorsement["score"], reverse=True)
        best_name = max((entry["name"] for entry in entries), key=len)
        best_location = next((entry["location"] for entry in entries if entry.get("location")), None)
        best_cuisine = next((entry["cuisine"] for entry in entries if entry.get("cuisine")), None)

        restaurants.append(
            {
                "name": best_name,
                "location": best_location,
                "cuisine": best_cuisine,
                "aggregate_score": sum(entry["score"] for entry in entries),
                "mention_count": len(entries),
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


def _geocode_key(name: str, location: str | None) -> str:
    return f"{(name or '').strip().lower()}|{(location or '').strip().lower()}"


def _load_geocode_cache() -> dict[str, list]:
    """Lazily load the on-disk geocode cache (once per process)."""
    global _geocode_cache
    if _geocode_cache is None:
        try:
            _geocode_cache = json.loads(GEOCODE_CACHE_PATH.read_text(encoding="utf-8"))
        except (FileNotFoundError, json.JSONDecodeError):
            _geocode_cache = {}
    return _geocode_cache


def _save_geocode_cache() -> None:
    if _geocode_cache is None:
        return
    GEOCODE_CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    GEOCODE_CACHE_PATH.write_text(
        json.dumps(_geocode_cache, ensure_ascii=False), encoding="utf-8"
    )


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
    "silverado": "Silverado", "sunsetbeach": "Huntington Beach",
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
_OC_CITIES = sorted(
    set(SUBREDDIT_CITY.values())
    | {"Corona del Mar", "Sunset Beach", "Anaheim Hills", "Foothill Ranch",
       "Newport Beach", "Long Beach", "Cerritos", "Norwalk", "Artesia"},
    key=len,
    reverse=True,  # match longer names first ("Anaheim Hills" before "Anaheim")
)
_LOCATION_ALIASES = {
    "hb": "Huntington Beach", "huntington": "Huntington Beach", "cm": "Costa Mesa",
    "sa": "Santa Ana", "sna": "Santa Ana", "fv": "Fountain Valley", "gg": "Garden Grove",
    "cdm": "Corona del Mar", "dp": "Dana Point", "sjc": "San Juan Capistrano",
    "lb": "Long Beach", "mv": "Mission Viejo", "lf": "Lake Forest",
    "rsm": "Rancho Santa Margarita", "newport": "Newport Beach", "aliso": "Aliso Viejo",
    "fhr": "Foothill Ranch", "foothillranch": "Foothill Ranch",
    "uci": "Irvine", "ucitowncenter": "Irvine", "csuf": "Fullerton",
}


def _loc_key(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", s.lower())


def normalize_location(location: str | None) -> str | None:
    """Normalize a free-text location to a canonical OC city for geocoding.

    Takes the first city of a multi-city string, expands abbreviations/partials, and
    maps a neighborhood/street that names a known city to that city. Falls back to a
    title-cased best effort, or None when empty.
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
    return first.title()


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
    ratio = difflib.SequenceMatcher(None, _loc_key(query_name), _loc_key(result_name)).ratio()
    qt = _name_tokens(query_name)
    subset = bool(qt) and qt <= _name_tokens(result_name)
    return max(ratio, 0.9 if subset else 0.0)


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


def default_geocode(name: str, location: str | None) -> tuple[float | None, float | None, str]:
    location = normalize_location(location)
    if not location:
        return None, None, "missing location"

    # Cache hit: skip both the network round-trip and the rate-limit sleep. Many
    # restaurants recur across threads, so this is the dominant throughput win.
    cache = _load_geocode_cache()
    key = _geocode_key(name, location)
    if key in cache:
        lat, lng, detail = cache[key]
        return lat, lng, detail

    query = f"{name}, {location}, Orange County, CA"
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

    # Throttle real network calls to honor Nominatim's ~1 req/s policy. Spacing is
    # measured start-to-start, so the request's own latency counts toward the gap.
    global _last_geocode_ts
    wait = GEOCODE_MIN_INTERVAL_S - (time.monotonic() - _last_geocode_ts)
    if wait > 0:
        time.sleep(wait)
    _last_geocode_ts = time.monotonic()

    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            results = json.loads(response.read())
    except Exception as exc:
        # Don't cache transient network failures — they should be retried next run.
        return None, None, str(exc)

    if not results:
        result = (None, None, "no results")
    else:
        hit = results[0]
        lat = float(hit["lat"])
        lng = float(hit["lon"])
        display_name = hit.get("display_name", "")
        if not (33.3 <= lat <= 34.0 and -118.2 <= lng <= -117.3):
            result = (None, None, f"outside OC bounds: {lat},{lng} ({display_name})")
        else:
            result = (lat, lng, display_name)

    # Fallback: when Nominatim has no in-OC hit, try Mapbox's POI-rich Search Box
    # (accepting only a strongly name+city-matched result -- see _mapbox_accept).
    if result[0] is None:
        mb = _mapbox_geocode(name, location)
        if mb[0] is not None:
            result = mb

    # Cache only positive resolutions (from either provider). Negatives are left
    # uncached so a later run retries them instead of being pinned to failure forever.
    if result[0] is not None:
        cache[key] = list(result)
        _save_geocode_cache()
    return result


def build_thread(
    thread_dir: Path,
    extract_entities_fn: Callable[..., Any] = default_extract_entities,
    geocode_fn: Callable[..., tuple[float | None, float | None, str]] = default_geocode,
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
    for restaurant in restaurants:
        lat, lng, detail = geocode_fn(
            restaurant["name"],
            restaurant.get("location") or _subreddit_city(manifest["subreddit"]),
        )
        restaurant["lat"] = lat
        restaurant["lng"] = lng
        if lat is not None and lng is not None:
            geocoded_count += 1
        else:
            unresolved.append(
                {
                    "name": restaurant["name"],
                    "location": restaurant.get("location"),
                    "cuisine": restaurant.get("cuisine"),
                    "reason": detail,
                }
            )

    geocoded_dataset = {
        "restaurants": restaurants,
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


def _load_assign_slugs() -> Callable[[list[dict[str, Any]]], list[tuple[dict[str, Any], str]]]:
    """Lazily import `assign_slugs` from migrate_json_to_db (same scripts/ dir).

    Lazy + path-injecting so existing subcommands that never call write_to_db
    don't pay the import cost or break if migrate_json_to_db itself can't load.
    """
    scripts_dir = str(Path(__file__).resolve().parent)
    if scripts_dir not in sys.path:
        sys.path.insert(0, scripts_dir)
    from migrate_json_to_db import assign_slugs  # type: ignore[import-not-found]
    return assign_slugs


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

    assign_slugs = _load_assign_slugs()
    thread_id = manifest["id"]

    restaurants_inserted = 0
    mentions_inserted = 0

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

            # 2. Restaurants — assign collision-safe slugs (imported from migrate_json_to_db)
            for restaurant, slug in assign_slugs(restaurants_with_geocodes):
                cur.execute(
                    """
                    INSERT INTO restaurants (name, slug, location, cuisine, lat, lng)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    ON CONFLICT (slug) DO UPDATE SET
                        name = EXCLUDED.name,
                        location = EXCLUDED.location,
                        cuisine = EXCLUDED.cuisine,
                        lat = EXCLUDED.lat,
                        lng = EXCLUDED.lng,
                        updated_at = now()
                    RETURNING id
                    """,
                    (
                        restaurant["name"],
                        slug,
                        restaurant.get("location"),
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

                # 3. Primary mention — role='primary', classification NULL
                primary = restaurant["primary_comment"]
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
                    mentions_inserted += 1

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
    print(json.dumps(event), flush=True)


def ingest(
    html_path: Path,
    *,
    limit: int | None = None,
    dry_run: bool = False,
    extract_entities_fn: Callable[..., Any] = default_extract_entities,
    geocode_fn: Callable[..., tuple[float | None, float | None, str]] = default_geocode,
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
    for index, root in enumerate(roots, start=1):
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
                "progress": index / total_roots,
                "message": f"extracted entities from comment {index}/{total_roots}",
                "comment_id": root["id"],
                "entity_count": len(entities),
            }
        )

    thread_dataset = build_thread_dataset(parsed_thread, entity_records)
    restaurants = copy.deepcopy(thread_dataset["restaurants"])
    total_restaurants = len(restaurants) or 1

    for index, restaurant in enumerate(restaurants, start=1):
        lat, lng, detail = geocode_fn(
            restaurant["name"],
            restaurant.get("location") or _subreddit_city(manifest["subreddit"]),
        )
        restaurant["lat"] = lat
        restaurant["lng"] = lng
        _emit_progress(
            {
                "stage": "geocode",
                "progress": index / total_restaurants,
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
    for html_path in files:
        try:
            ingest(html_path, limit=limit, dry_run=dry_run)
            if not dry_run and archive:
                dest = _archive_ingested_html(html_path)
                print(f"archived -> {dest}")
        except Exception as exc:  # skip + continue to the next file
            failures += 1
            print(f"ERROR ingesting {html_path.name}: {exc}", file=sys.stderr)
    return 1 if failures else 0


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

    parser.error(f"Unknown command: {args.command}")
    return 2


if __name__ == "__main__":
    sys.exit(main())
