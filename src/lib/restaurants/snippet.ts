export interface SnippetSegment {
  text: string;
  isMatch: boolean;
}

export interface SnippetResult {
  text: string;
  segments: SnippetSegment[];
}

const leadingArticles = new Set(["the", "a", "an", "el", "la", "los", "las"]);

const genericWords = new Set([
  "the",
  "and",
  "a",
  "of",
  "in",
  "to",
  "for",
  "with",
  "on",
  "at",
  "by",
  "an",
  "el",
  "la",
  "los",
  "las",
  "restaurant",
  "cafe",
  "bakery",
  "kitchen",
  "place",
  "grill",
  "house",
  "bar",
  "shop",
  "coffee",
  "co",
  "pizza",
  "taco",
  "tacos",
  "burger",
  "burgers",
  "food",
  "market",
  "deli",
  "inn",
  "bistro",
  "pub",
  "lounge",
  "taqueria",
  "express",
  "boba",
  "tea",
  "creme",
  "cream",
]);

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Find the start index and length of the first occurrence of the restaurant name
 * inside the comment body, using exact, possessive/plural, and fuzzy keyword matches.
 */
export function findRestaurantMatch(
  body: string,
  restaurantName: string,
): { index: number; length: number } | null {
  if (!body || !restaurantName) return null;

  // 1. Try exact match (case-insensitive) with boundary checks
  const escapedName = escapeRegExp(restaurantName);
  let regex = new RegExp(`(?:\\b|^)${escapedName}(?:'s|’s|s)?(?:\\b|$)`, "i");
  let match = regex.exec(body);
  if (match) {
    return { index: match.index, length: match[0].length };
  }

  // 2. Try match without word boundaries (in case punctuation is directly attached)
  regex = new RegExp(escapedName, "i");
  match = regex.exec(body);
  if (match) {
    return { index: match.index, length: match[0].length };
  }

  // 3. Try matching after removing leading/trailing lightweight articles (e.g. "The Vox Kitchen" -> "Vox Kitchen")
  const nameWords = restaurantName.split(/\s+/);
  if (nameWords.length > 1) {
    let startIdx = 0;
    while (
      startIdx < nameWords.length &&
      leadingArticles.has(nameWords[startIdx].toLowerCase())
    ) {
      startIdx++;
    }
    let endIdx = nameWords.length - 1;
    while (
      endIdx >= startIdx &&
      leadingArticles.has(nameWords[endIdx].toLowerCase())
    ) {
      endIdx--;
    }
    if (startIdx <= endIdx && (startIdx > 0 || endIdx < nameWords.length - 1)) {
      const subName = nameWords.slice(startIdx, endIdx + 1).join(" ");
      if (subName.length >= 3) {
        const subEscaped = escapeRegExp(subName);
        const subRegex = new RegExp(
          `(?:\\b|^)${subEscaped}(?:'s|’s|s)?(?:\\b|$)`,
          "i",
        );
        const subMatch = subRegex.exec(body);
        if (subMatch) {
          return { index: subMatch.index, length: subMatch[0].length };
        }
      }
    }
  }

  // 4. Fuzzy fallback: extract unique keywords
  const words = restaurantName
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((w) => w.length > 0);

  const keywords = words.filter((w) => w.length >= 3 && !genericWords.has(w));

  // Try matching keywords in order
  for (const kw of keywords) {
    const kwRegex = new RegExp(`\\b${escapeRegExp(kw)}(?:'s|’s|s)?\\b`, "i");
    const kwMatch = kwRegex.exec(body);
    if (kwMatch) {
      return { index: kwMatch.index, length: kwMatch[0].length };
    }
  }

  // Try matching keywords even without word boundaries
  for (const kw of keywords) {
    const kwRegex = new RegExp(escapeRegExp(kw), "i");
    const kwMatch = kwRegex.exec(body);
    if (kwMatch) {
      return { index: kwMatch.index, length: kwMatch[0].length };
    }
  }

  // 5. Ultimate fallback: longest word in the name
  if (words.length > 0) {
    const longestWord = words.reduce(
      (longest, current) =>
        current.length > longest.length ? current : longest,
      "",
    );
    if (longestWord.length >= 3) {
      const lwRegex = new RegExp(escapeRegExp(longestWord), "i");
      const lwMatch = lwRegex.exec(body);
      if (lwMatch) {
        return { index: lwMatch.index, length: lwMatch[0].length };
      }
    }
  }

  return null;
}

interface SentenceInfo {
  text: string;
  start: number;
  end: number;
}

function getFragmentsWithIndices(text: string): SentenceInfo[] {
  const fragments: SentenceInfo[] = [];
  let start = 0;

  const flush = (end: number) => {
    const slice = text.slice(start, end);
    const lead = slice.match(/^[ \t\r]*/)?.[0].length ?? 0;
    const trail = slice.match(/[ \t\r]*$/)?.[0].length ?? 0;
    const fragStart = start + lead;
    const fragEnd = end - trail;
    if (fragEnd > fragStart) {
      fragments.push({
        text: text.slice(fragStart, fragEnd),
        start: fragStart,
        end: fragEnd,
      });
    }
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "\n") {
      flush(i);
      start = i + 1;
      continue;
    }
    if (ch === "." || ch === "!" || ch === "?") {
      let j = i;
      while (
        j + 1 < text.length &&
        (text[j + 1] === "." || text[j + 1] === "!" || text[j + 1] === "?")
      ) {
        j++;
      }
      flush(j + 1);
      start = j + 1;
      i = j;
    }
  }
  if (start < text.length) {
    flush(text.length);
  }
  return fragments;
}

function shareALine(
  left: SentenceInfo,
  right: SentenceInfo,
  body: string,
): boolean {
  return !body.slice(left.end, right.start).includes("\n");
}

function expandSameLineWindow(
  fragments: SentenceInfo[],
  targetIndex: number,
  body: string,
  maxLen: number,
): { startIdx: number; endIdx: number } {
  let startIdx = targetIndex;
  let endIdx = targetIndex;

  const windowText = (from: number, to: number) =>
    body.slice(fragments[from].start, fragments[to].end);

  if (targetIndex > 0) {
    const prev = fragments[targetIndex - 1];
    const named = fragments[targetIndex];
    if (
      shareALine(prev, named, body) &&
      windowText(targetIndex - 1, endIdx).length <= maxLen
    ) {
      startIdx = targetIndex - 1;
    }
  }

  if (endIdx + 1 < fragments.length) {
    const last = fragments[endIdx];
    const next = fragments[endIdx + 1];
    if (
      shareALine(last, next, body) &&
      windowText(startIdx, endIdx + 1).length <= maxLen
    ) {
      endIdx += 1;
    }
  }

  return { startIdx, endIdx };
}

function cropToMatchedWindow(
  text: string,
  localMatchStart: number,
  localMatchLength: number,
  maxLen: number,
): { text: string; matchStart: number; matchLength: number } {
  if (text.length <= maxLen) {
    return { text, matchStart: localMatchStart, matchLength: localMatchLength };
  }

  // Drop prefix to fit maxLen, but never cut the end of the fragment — and
  // never drop the restaurant name even if that means exceeding maxLen.
  let start = Math.max(0, text.length - maxLen);
  const end = text.length;
  if (start > localMatchStart) {
    start = localMatchStart;
  }

  // Adjust to nearest word boundary if possible, without cutting into the match
  let adjustedStart = start;
  if (start > 0) {
    const searchLimit = Math.min(localMatchStart, start + 15);
    for (let i = start; i < searchLimit; i++) {
      if (/\s/.test(text[i])) {
        adjustedStart = i + 1;
        break;
      }
    }
  }

  let result = text.substring(adjustedStart, end);
  let finalMatchStart = localMatchStart - adjustedStart;

  if (adjustedStart > 0) {
    result = "..." + result;
    finalMatchStart += 3;
  }

  return {
    text: result,
    matchStart: finalMatchStart,
    matchLength: localMatchLength,
  };
}

function cropFallback(
  text: string,
  maxLen: number,
): { text: string; matchStart: number; matchLength: number } {
  if (text.length <= maxLen) {
    return { text, matchStart: -1, matchLength: 0 };
  }

  let end = maxLen;
  // Scan backward to find a space
  for (let i = end - 1; i >= Math.max(0, maxLen - 20); i--) {
    if (/\s/.test(text[i])) {
      end = i;
      break;
    }
  }

  return {
    text: text.substring(0, end).trim() + "...",
    matchStart: -1,
    matchLength: 0,
  };
}

export function buildSegments(
  text: string,
  matchStart: number,
  matchLength: number,
): SnippetSegment[] {
  if (matchStart < 0 || matchLength <= 0 || matchStart >= text.length) {
    return [{ text, isMatch: false }];
  }

  const segments: SnippetSegment[] = [];

  const before = text.substring(0, matchStart);
  if (before.length > 0) {
    segments.push({ text: before, isMatch: false });
  }

  const match = text.substring(matchStart, matchStart + matchLength);
  if (match.length > 0) {
    segments.push({ text: match, isMatch: true });
  }

  const after = text.substring(matchStart + matchLength);
  if (after.length > 0) {
    segments.push({ text: after, isMatch: false });
  }

  return segments;
}

/**
 * Main entry point: takes a comment body and a restaurant name, and returns
 * the delimiter-bounded fragment that names the restaurant (newlines or .!?),
 * plus same-line previous/next fragments when they fit in maxLen. Oversized
 * named fragments crop the prefix so the rest of the sentence is kept.
 */
export function getTrimmedSnippet(
  body: string,
  restaurantName: string,
  maxLen: number = 150,
): SnippetResult {
  const normalizedBody = (body || "").trim();
  if (!normalizedBody) {
    return { text: "", segments: [] };
  }

  const fragments = getFragmentsWithIndices(normalizedBody);
  const matchInfo = findRestaurantMatch(normalizedBody, restaurantName);

  if (!matchInfo || fragments.length === 0) {
    const fallbackText = fragments
      .slice(0, 3)
      .map((fragment) => fragment.text)
      .join(" ");
    const cropped = cropFallback(fallbackText, maxLen);
    return {
      text: cropped.text,
      segments: buildSegments(
        cropped.text,
        cropped.matchStart,
        cropped.matchLength,
      ),
    };
  }

  const matchIndex = matchInfo.index;
  const matchLength = matchInfo.length;

  let targetIndex = fragments.findIndex(
    (fragment) => fragment.start <= matchIndex && fragment.end > matchIndex,
  );
  if (targetIndex === -1) {
    targetIndex = 0;
  }

  const { startIdx, endIdx } = expandSameLineWindow(
    fragments,
    targetIndex,
    normalizedBody,
    maxLen,
  );
  const windowStart = fragments[startIdx].start;
  const windowText = normalizedBody.slice(windowStart, fragments[endIdx].end);
  const localMatchStart = matchIndex - windowStart;
  const cropped = cropToMatchedWindow(
    windowText,
    localMatchStart,
    matchLength,
    maxLen,
  );

  return {
    text: cropped.text,
    segments: buildSegments(
      cropped.text,
      cropped.matchStart,
      cropped.matchLength,
    ),
  };
}
