#!/usr/bin/env python3
from __future__ import annotations

import argparse
import copy
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


ROOT = Path(__file__).resolve().parents[1]
DATA_ROOT = ROOT / "data"
THREADS_ROOT = DATA_ROOT / "threads"
OVERRIDES_PATH = DATA_ROOT / "overrides" / "restaurants.json"
GENERATED_DATA_PATH = ROOT / "src" / "lib" / "data" / "generated" / "restaurants.json"

OLLAMA_URL = os.environ.get("OC_FOOD_RECS_OLLAMA_URL", "http://127.0.0.1:11434/api/chat")
OLLAMA_MODEL = os.environ.get("OC_FOOD_RECS_OLLAMA_MODEL", "gemma4:latest")

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
HEADERS = {"User-Agent": "oc-food-recs-pipeline/1.0 (personal project)"}
OC_BOUNDS = {
    "viewbox": "-118.1,33.38,-117.4,33.95",
    "bounded": "1",
}

ENDORSEMENT_TYPES = {"dish_rec", "endorsement", "personal_story"}
THREAD_FOLDER_PATTERN = "{subreddit}-{post_id}"

SYSTEM_PROMPT = """You are a structured data extractor. Given a Reddit comment recommending food/drink spots, extract each establishment mentioned into a JSON array.

For each establishment, return:
- "name": the establishment name (required)
- "location": city or neighborhood if mentioned, else null
- "cuisine": cuisine type if inferable, else null

Include any food or drink establishment (restaurants, cafes, bakeries, ice cream shops, delis, food trucks, etc.).
Expand common Orange County abbreviations: HB = Huntington Beach, CM = Costa Mesa, SA = Santa Ana, FV = Fountain Valley, GG = Garden Grove, CdM = Corona del Mar, DP = Dana Point, SJC = San Juan Capistrano, LB = Long Beach.

If the comment is NOT recommending any food/drink establishment (e.g., a question, meta comment about the thread), return an empty array [].

Return ONLY valid JSON. No explanation, no markdown fences."""


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


def fetch_reddit_json(url: str, comment_ids: list[str] | None = None) -> dict[str, Any]:
    """Fetch Reddit JSON from a permalink URL."""
    if not url.endswith("/"):
        url += "/"
    json_url = url + ".json"

    if comment_ids:
        json_url += f"?comment={','.join(comment_ids)}"

    request = urllib.request.Request(json_url, headers=HEADERS)
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            data = json.loads(response.read())
    except Exception as exc:
        raise RuntimeError(f"Failed to fetch Reddit JSON from {json_url}: {exc}") from exc

    if not isinstance(data, list) or len(data) < 2:
        raise RuntimeError(f"Unexpected Reddit JSON structure from {json_url}")

    return data


def fetch_missing_comments(url: str, comment_ids: list[str], post_id: str) -> list[dict[str, Any]]:
    """Fetch specific comments by their IDs using Reddit's morechildren API."""
    if not comment_ids:
        return []

    reddit_json = fetch_reddit_json(url, comment_ids)
    comments_data = reddit_json[1]["data"]["children"]
    return [c for c in comments_data if c.get("kind") == "t1"]


def fetch_more_children(post_id: str, children_ids: list[str]) -> list[dict[str, Any]]:
    """Fetch comments using Reddit's morechildren API."""
    if not children_ids:
        return []

    api_url = f"https://www.reddit.com/api/morechildren.json"
    params = {
        "link_id": f"t3_{post_id}",
        "children": ",".join(children_ids[:100]),  # Reddit limits to 100 per request
        "api_type": "json",
    }

    request = urllib.request.Request(
        f"{api_url}?{urllib.parse.urlencode(params)}",
        headers=HEADERS,
    )

    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            data = json.loads(response.read())
    except Exception as exc:
        print(f"Warning: Failed to fetch more children: {exc}", file=sys.stderr)
        return []

    if not isinstance(data, dict) or "json" not in data:
        return []

    comments = data["json"]["data"]["things"]
    return [c for c in comments if c.get("kind") == "t1"]


def extract_more_objects(comment_data: dict[str, Any]) -> list[dict[str, Any]]:
    """Extract all 'more' objects from a comment tree."""
    more_objects: list[dict[str, Any]] = []

    def traverse(node: dict[str, Any]) -> None:
        if node.get("kind") == "more":
            more_objects.append(node)
        elif node.get("kind") == "t1" and "data" in node:
            replies = node["data"].get("replies", {})
            if replies and "data" in replies:
                for child in replies["data"].get("children", []):
                    traverse(child)

    if comment_data.get("kind") == "Listing" and "data" in comment_data:
        for child in comment_data["data"].get("children", []):
            traverse(child)
    else:
        traverse(comment_data)

    return more_objects


def replace_more_in_tree(node: dict[str, Any], post_id: str, fetched_map: dict[str, dict[str, Any]]) -> dict[str, Any]:
    """Recursively replace 'more' objects in the tree with fetched comments."""
    if node.get("kind") == "more":
        children_ids = node.get("data", {}).get("children", [])
        replacement_comments = []
        for comment_id in children_ids:
            if comment_id in fetched_map:
                replacement_comments.append(fetched_map[comment_id])
        
        if replacement_comments:
            return replacement_comments
        return node
    
    elif node.get("kind") == "t1" and "data" in node:
        replies = node["data"].get("replies", {})
        if replies and "data" in replies:
            new_children = []
            for child in replies["data"].get("children", []):
                replaced = replace_more_in_tree(child, post_id, fetched_map)
                if isinstance(replaced, list):
                    new_children.extend(replaced)
                else:
                    new_children.append(replaced)
            replies["data"]["children"] = new_children
    
    return node


def fetch_all_comments_praw(url: str) -> list[dict[str, Any]]:
    """Fetch all comments using PRAW library for complete coverage."""
    reddit = praw.Reddit(
        user_agent="oc-food-recs-pipeline/1.0",
        client_id="",
        client_secret="",
        check_for_updates=False,
    )

    submission = reddit.submission(url=url)
    submission.comments.replace_more(limit=None)

    all_comments: list[dict[str, Any]] = []

    def comment_to_dict(comment: praw.models.Comment) -> dict[str, Any]:
        return {
            "kind": "t1",
            "data": {
                "id": comment.id,
                "author": str(comment.author) if comment.author else "[deleted]",
                "body": comment.body,
                "score": comment.score,
                "created_utc": comment.created_utc,
                "parent_id": comment.parent_id,
                "permalink": comment.permalink,
                "replies": {"data": {"children": []}} if not comment.replies else None,
            },
        }

    def process_comment(comment: praw.models.Comment) -> dict[str, Any]:
        comment_dict = comment_to_dict(comment)
        if comment.replies:
            replies_list = []
            for reply in comment.replies:
                if isinstance(reply, praw.models.Comment):
                    replies_list.append(process_comment(reply))
            comment_dict["data"]["replies"] = {"data": {"children": replies_list}}
        return comment_dict

    for comment in submission.comments:
        if isinstance(comment, praw.models.Comment):
            all_comments.append(process_comment(comment))

    return all_comments


def fetch_all_comments(url: str, max_depth: int = 10) -> dict[str, Any]:
    """Recursively fetch all comments including those hidden in 'more' objects."""
    reddit_json = fetch_reddit_json(url)
    all_comments = reddit_json[1]["data"]["children"]
    
    post_id = reddit_json[0]["data"]["children"][0]["data"]["id"]

    depth = 0
    while depth < max_depth:
        more_objects = extract_more_objects({"kind": "Listing", "data": {"children": all_comments}})
        if not more_objects:
            break

        all_comment_ids: list[str] = []
        for more_obj in more_objects:
            children = more_obj.get("data", {}).get("children", [])
            all_comment_ids.extend(children)

        if not all_comment_ids:
            break

        fetched_comments = fetch_more_children(post_id, all_comment_ids)

        comment_id_map = {c["data"]["id"]: c for c in all_comments if c.get("kind") == "t1"}
        new_comments_added = 0
        for new_comment in fetched_comments:
            comment_id = new_comment["data"]["id"]
            if comment_id not in comment_id_map:
                all_comments.append(new_comment)
                comment_id_map[comment_id] = new_comment
                new_comments_added += 1

        if new_comments_added == 0:
            break

        depth += 1

    reddit_json[1]["data"]["children"] = [c for c in all_comments if c.get("kind") != "more"]
    return reddit_json


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


def init_thread_from_json(url: str, reddit_json: list[dict[str, Any]], threads_root: Path = THREADS_ROOT) -> Path:
    parsed_thread = parse_reddit_json(reddit_json)
    thread_id = thread_folder_name(parsed_thread)
    thread_dir = threads_root / thread_id

    ensure_directory(thread_dir / "raw")
    ensure_directory(thread_dir / "processed")
    ensure_directory(thread_dir / "review")

    write_json(thread_dir / "raw" / "thread.json", reddit_json)

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
            "source_url": url,
            "source_type": "reddit_json",
        },
    }
    write_json(thread_dir / "manifest.json", manifest)
    return thread_dir


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


def normalize_extractor_result(result: Any) -> tuple[list[dict[str, Any]], str | None]:
    raw: str | None = None
    entities: Any = result

    if isinstance(result, tuple) and len(result) == 2:
        entities, raw = result
    elif isinstance(result, dict) and "entities" in result:
        entities = result["entities"]
        raw = result.get("raw")

    if entities is None:
        return [], raw

    if isinstance(entities, dict):
        entities = [entities]

    cleaned: list[dict[str, Any]] = []
    for entity in entities:
        if not isinstance(entity, dict):
            continue
        name = normalize_text(str(entity.get("name", "")))
        if not name:
            continue
        cleaned.append(
            {
                "name": name,
                "location": normalize_text(str(entity["location"])) if entity.get("location") else None,
                "cuisine": normalize_text(str(entity["cuisine"])) if entity.get("cuisine") else None,
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
                    "type": reply_type,
                    "author": child["author"],
                    "body": child["body"],
                    "score": child["score"],
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
            "endorsement_types_kept": sorted(ENDORSEMENT_TYPES),
        },
    }


def default_geocode(name: str, location: str | None) -> tuple[float | None, float | None, str]:
    if not location:
        return None, None, "missing location"

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

    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            results = json.loads(response.read())
    except Exception as exc:
        return None, None, str(exc)

    if not results:
        return None, None, "no results"

    hit = results[0]
    lat = float(hit["lat"])
    lng = float(hit["lon"])
    display_name = hit.get("display_name", "")
    if not (33.3 <= lat <= 34.0 and -118.2 <= lng <= -117.3):
        return None, None, f"outside OC bounds: {lat},{lng} ({display_name})"
    return lat, lng, display_name


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
        lat, lng, detail = geocode_fn(restaurant["name"], restaurant.get("location"))
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

        if geocode_fn is default_geocode:
            time.sleep(1.05)

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


def load_overrides(overrides_path: Path = OVERRIDES_PATH) -> dict[str, Any]:
    data = load_json(overrides_path, default=None)
    if data is None:
        return {
            "aliases": {},
            "thread_overrides": {},
            "restaurant_overrides": {},
        }
    return {
        "aliases": data.get("aliases", {}),
        "thread_overrides": data.get("thread_overrides", {}),
        "restaurant_overrides": data.get("restaurant_overrides", {}),
    }


def find_override(mapping: dict[str, Any], key: str) -> Any:
    normalized_key = normalize_name(key)
    for current_key, value in mapping.items():
        if normalize_name(current_key) == normalized_key:
            return value
    return None


def apply_restaurant_override(restaurant: dict[str, Any], override: dict[str, Any] | None) -> dict[str, Any]:
    if not override:
        return restaurant
    updated = copy.deepcopy(restaurant)
    for field in ["name", "location", "cuisine", "lat", "lng"]:
        if field in override:
            updated[field] = override[field]
    return updated


def merge_restaurant(existing: dict[str, Any], incoming: dict[str, Any], thread_id: str) -> dict[str, Any]:
    merged = copy.deepcopy(existing)
    merged["aggregate_score"] += incoming["aggregate_score"]
    merged["mention_count"] += incoming["mention_count"]
    merged["source_threads"] = sorted(set(merged["source_threads"] + [thread_id] + incoming.get("source_threads", [])))

    if not merged.get("location") and incoming.get("location"):
        merged["location"] = incoming["location"]
    if not merged.get("cuisine") and incoming.get("cuisine"):
        merged["cuisine"] = incoming["cuisine"]
    if merged.get("lat") is None and incoming.get("lat") is not None:
        merged["lat"] = incoming["lat"]
    if merged.get("lng") is None and incoming.get("lng") is not None:
        merged["lng"] = incoming["lng"]

    if incoming["primary_comment"]["score"] > merged["primary_comment"]["score"]:
        merged["primary_comment"] = incoming["primary_comment"]

    seen = {
        (endorsement["type"], endorsement["author"], endorsement["body"])
        for endorsement in merged["endorsements"]
    }
    for endorsement in incoming["endorsements"]:
        key = (endorsement["type"], endorsement["author"], endorsement["body"])
        if key not in seen:
            seen.add(key)
            merged["endorsements"].append(endorsement)
    merged["endorsements"].sort(key=lambda endorsement: endorsement["score"], reverse=True)
    return merged


def iter_publishable_threads(threads_root: Path) -> list[tuple[dict[str, Any], Path]]:
    items: list[tuple[dict[str, Any], Path]] = []
    for thread_dir in sorted(path for path in threads_root.iterdir() if path.is_dir()):
        manifest = load_json(thread_dir / "manifest.json", default=None)
        if not manifest or not manifest.get("include_in_publish", True):
            continue
        geocoded_path = thread_dir / "processed" / "restaurants.geocoded.json"
        if not geocoded_path.exists():
            continue
        items.append((manifest, geocoded_path))
    return items


def publish_threads(
    threads_root: Path = THREADS_ROOT,
    output_path: Path = GENERATED_DATA_PATH,
    overrides_path: Path = OVERRIDES_PATH,
) -> dict[str, Any]:
    overrides = load_overrides(overrides_path)
    aliases = overrides["aliases"]
    thread_overrides = overrides["thread_overrides"]
    restaurant_overrides = overrides["restaurant_overrides"]

    source_threads: list[dict[str, Any]] = []
    models_used: list[str] = []
    endorsement_types: set[str] = set()
    total_comments_processed = 0
    merged_groups: dict[str, dict[str, Any]] = {}

    for manifest, geocoded_path in iter_publishable_threads(threads_root):
        geocoded_data = load_json(geocoded_path, default={"restaurants": [], "meta": {}})
        meta = geocoded_data.get("meta", {})
        total_comments_processed += meta.get("total_comments_processed", manifest.get("comment_count", 0))

        model_name = meta.get("model_used")
        if model_name and model_name not in models_used:
            models_used.append(model_name)

        for endorsement_type in meta.get("endorsement_types_kept", []):
            endorsement_types.add(endorsement_type)

        source_threads.append(
            {
                "id": manifest["id"],
                "title": manifest["title"],
                "url": manifest["url"],
                "subreddit": manifest["subreddit"],
                "post_id": manifest["post_id"],
                "comment_count": manifest.get("comment_count", meta.get("total_comments_processed", 0)),
                "restaurant_count": len(geocoded_data.get("restaurants", [])),
            }
        )

        per_thread_overrides = thread_overrides.get(manifest["id"], {})
        for restaurant in geocoded_data.get("restaurants", []):
            current = copy.deepcopy(restaurant)
            current["source_threads"] = [manifest["id"]]

            current = apply_restaurant_override(current, find_override(per_thread_overrides, current["name"]))

            alias_name = find_override(aliases, current["name"])
            if alias_name:
                current["name"] = alias_name

            key = normalize_name(current["name"])
            if key in merged_groups:
                merged_groups[key] = merge_restaurant(merged_groups[key], current, manifest["id"])
            else:
                merged_groups[key] = current

    restaurants: list[dict[str, Any]] = []
    for restaurant in merged_groups.values():
        final = apply_restaurant_override(restaurant, find_override(restaurant_overrides, restaurant["name"]))
        restaurants.append(final)

    restaurants.sort(key=lambda restaurant: restaurant["aggregate_score"], reverse=True)
    source_threads.sort(key=lambda thread: thread["id"])

    geocoded_count = sum(1 for restaurant in restaurants if restaurant.get("lat") is not None and restaurant.get("lng") is not None)
    published = {
        "restaurants": restaurants,
        "meta": {
            "source_threads": source_threads,
            "total_restaurants": len(restaurants),
            "total_comments_processed": total_comments_processed,
            "model_used": ", ".join(models_used),
            "generated_at": current_timestamp(),
            "endorsement_types_kept": sorted(endorsement_types),
            "geocoded_count": geocoded_count,
            "unmapped_count": len(restaurants) - geocoded_count,
        },
    }
    write_json(output_path, published)
    return published


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="OC Food Recs Reddit ingestion pipeline")
    subparsers = parser.add_subparsers(dest="command", required=True)

    init_parser = subparsers.add_parser("init-thread", help="Create a thread folder from a saved Reddit HTML file")
    init_parser.add_argument("--html", required=True, type=Path)

    fetch_parser = subparsers.add_parser("fetch-thread", help="Fetch a Reddit thread from URL and initialize it")
    fetch_parser.add_argument("--url", required=True, type=str)

    build_parser = subparsers.add_parser("build-thread", help="Parse, extract, and geocode one saved Reddit thread")
    build_parser.add_argument("--thread", required=True)

    publish_parser = subparsers.add_parser("publish", help="Merge publishable threads into the app dataset")
    publish_parser.add_argument("--output", type=Path, default=GENERATED_DATA_PATH)

    args = parser.parse_args(argv)

    if args.command == "init-thread":
        thread_dir = init_thread(args.html)
        print(thread_dir)
        return 0

    if args.command == "fetch-thread":
        reddit_json = fetch_all_comments(args.url)
        thread_dir = init_thread_from_json(args.url, reddit_json)
        print(thread_dir)
        return 0

    if args.command == "build-thread":
        thread_dir = THREADS_ROOT / args.thread
        result = build_thread(thread_dir)
        print(json.dumps(result["meta"], indent=2))
        return 0

    if args.command == "publish":
        published = publish_threads(output_path=args.output)
        print(json.dumps(published["meta"], indent=2))
        return 0

    parser.error(f"Unknown command: {args.command}")
    return 2


if __name__ == "__main__":
    sys.exit(main())
