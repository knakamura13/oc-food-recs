export interface SnippetSegment {
  text: string;
  isMatch: boolean;
}

export interface SnippetResult {
  text: string;
  segments: SnippetSegment[];
}

const leadingArticles = new Set(['the', 'a', 'an', 'el', 'la', 'los', 'las']);

const genericWords = new Set([
  'the', 'and', 'a', 'of', 'in', 'to', 'for', 'with', 'on', 'at', 'by', 'an', 'el', 'la', 'los', 'las',
  'restaurant', 'cafe', 'bakery', 'kitchen', 'place', 'grill', 'house', 'bar', 'shop', 'coffee', 'co', 'pizza', 'taco', 'tacos', 'burger', 'burgers', 'food', 'market', 'deli', 'inn', 'bistro', 'pub', 'lounge', 'taqueria', 'express', 'boba', 'tea', 'creme', 'cream'
]);

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Find the start index and length of the first occurrence of the restaurant name
 * inside the comment body, using exact, possessive/plural, and fuzzy keyword matches.
 */
export function findRestaurantMatch(body: string, restaurantName: string): { index: number; length: number } | null {
  if (!body || !restaurantName) return null;

  // 1. Try exact match (case-insensitive) with boundary checks
  const escapedName = escapeRegExp(restaurantName);
  let regex = new RegExp(`(?:\\b|^)${escapedName}(?:'s|’s|s)?(?:\\b|$)`, 'i');
  let match = regex.exec(body);
  if (match) {
    return { index: match.index, length: match[0].length };
  }

  // 2. Try match without word boundaries (in case punctuation is directly attached)
  regex = new RegExp(escapedName, 'i');
  match = regex.exec(body);
  if (match) {
    return { index: match.index, length: match[0].length };
  }

  // 3. Try matching after removing leading/trailing lightweight articles (e.g. "The Vox Kitchen" -> "Vox Kitchen")
  const nameWords = restaurantName.split(/\s+/);
  if (nameWords.length > 1) {
    let startIdx = 0;
    while (startIdx < nameWords.length && leadingArticles.has(nameWords[startIdx].toLowerCase())) {
      startIdx++;
    }
    let endIdx = nameWords.length - 1;
    while (endIdx >= startIdx && leadingArticles.has(nameWords[endIdx].toLowerCase())) {
      endIdx--;
    }
    if (startIdx <= endIdx && (startIdx > 0 || endIdx < nameWords.length - 1)) {
      const subName = nameWords.slice(startIdx, endIdx + 1).join(' ');
      if (subName.length >= 3) {
        const subEscaped = escapeRegExp(subName);
        const subRegex = new RegExp(`(?:\\b|^)${subEscaped}(?:'s|’s|s)?(?:\\b|$)`, 'i');
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
    const kwRegex = new RegExp(`\\b${escapeRegExp(kw)}(?:'s|’s|s)?\\b`, 'i');
    const kwMatch = kwRegex.exec(body);
    if (kwMatch) {
      return { index: kwMatch.index, length: kwMatch[0].length };
    }
  }

  // Try matching keywords even without word boundaries
  for (const kw of keywords) {
    const kwRegex = new RegExp(escapeRegExp(kw), 'i');
    const kwMatch = kwRegex.exec(body);
    if (kwMatch) {
      return { index: kwMatch.index, length: kwMatch[0].length };
    }
  }

  // 5. Ultimate fallback: longest word in the name
  if (words.length > 0) {
    const longestWord = words.reduce((longest, current) => current.length > longest.length ? current : longest, '');
    if (longestWord.length >= 3) {
      const lwRegex = new RegExp(escapeRegExp(longestWord), 'i');
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

function getSentencesWithIndices(text: string): SentenceInfo[] {
  const sentences: SentenceInfo[] = [];
  // Match sentences by standard ending punctuation followed by whitespace (or end of string)
  const sentenceRegex = /[^.!?]+[.!?]*\s*/g;
  let match;
  while ((match = sentenceRegex.exec(text)) !== null) {
    const sentenceText = match[0];
    const start = match.index;
    const end = start + sentenceText.length;
    sentences.push({
      text: sentenceText,
      start,
      end
    });
  }
  return sentences;
}

function cropToMatchedWindow(
  text: string,
  localMatchStart: number,
  localMatchLength: number,
  maxLen: number
): { text: string; matchStart: number; matchLength: number } {
  if (text.length <= maxLen) {
    return { text, matchStart: localMatchStart, matchLength: localMatchLength };
  }

  const matchEnd = localMatchStart + localMatchLength;
  const matchMid = localMatchStart + (localMatchLength / 2);

  let start = Math.round(matchMid - (maxLen / 2));
  let end = start + maxLen;

  // Bound checks
  if (start < 0) {
    start = 0;
    end = maxLen;
  }
  if (end > text.length) {
    end = text.length;
    start = Math.max(0, end - maxLen);
  }

  // Ensure the match is fully visible in the cropped window
  if (start > localMatchStart) {
    start = localMatchStart;
    end = start + maxLen;
  }
  if (end < matchEnd) {
    end = matchEnd;
    start = Math.max(0, end - maxLen);
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

  let adjustedEnd = end;
  if (end < text.length) {
    const searchLimit = Math.max(matchEnd, end - 15);
    for (let i = end - 1; i >= searchLimit; i--) {
      if (/\s/.test(text[i])) {
        adjustedEnd = i;
        break;
      }
    }
  }

  let result = text.substring(adjustedStart, adjustedEnd);
  let finalMatchStart = localMatchStart - adjustedStart;

  // Add ellipses if truncated
  if (adjustedStart > 0) {
    result = '...' + result;
    finalMatchStart += 3;
  }
  if (adjustedEnd < text.length) {
    result = result + '...';
  }

  return {
    text: result,
    matchStart: finalMatchStart,
    matchLength: localMatchLength
  };
}

function cropFallback(text: string, maxLen: number): { text: string; matchStart: number; matchLength: number } {
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
    text: text.substring(0, end).trim() + '...',
    matchStart: -1,
    matchLength: 0
  };
}

export function buildSegments(text: string, matchStart: number, matchLength: number): SnippetSegment[] {
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
 * a trimmed snippet (max 3 sentences, capped at maxLen) along with safe
 * rendering segments where the matched restaurant name is highlighted.
 */
export function getTrimmedSnippet(body: string, restaurantName: string, maxLen: number = 150): SnippetResult {
  const normalizedBody = (body || '').trim();
  if (!normalizedBody) {
    return { text: '', segments: [] };
  }

  const sentences = getSentencesWithIndices(normalizedBody);
  const matchInfo = findRestaurantMatch(normalizedBody, restaurantName);

  if (!matchInfo || sentences.length === 0) {
    // Fallback: take first 3 sentences of the comment
    const fallbackSentences = sentences.slice(0, 3);
    const fallbackText = fallbackSentences.map(s => s.text).join('');
    const cropped = cropFallback(fallbackText, maxLen);
    return {
      text: cropped.text,
      segments: buildSegments(cropped.text, cropped.matchStart, cropped.matchLength)
    };
  }

  // Find the sentence index containing the match start
  const matchIndex = matchInfo.index;
  const matchLength = matchInfo.length;

  let targetIndex = sentences.findIndex(s => s.start <= matchIndex && s.end > matchIndex);
  if (targetIndex === -1) {
    targetIndex = 0;
  }

  // Create a 3-sentence window around the target index
  let startIdx = targetIndex - 1;
  let endIdx = targetIndex + 1;

  if (startIdx < 0) {
    startIdx = 0;
    endIdx = Math.min(sentences.length - 1, 2);
  }
  if (endIdx >= sentences.length) {
    endIdx = sentences.length - 1;
    startIdx = Math.max(0, endIdx - 2);
  }

  const windowStart = sentences[startIdx].start;
  const windowEnd = sentences[endIdx].end;
  const windowText = normalizedBody.substring(windowStart, windowEnd);

  const localMatchStart = matchIndex - windowStart;
  const cropped = cropToMatchedWindow(windowText, localMatchStart, matchLength, maxLen);

  return {
    text: cropped.text,
    segments: buildSegments(cropped.text, cropped.matchStart, cropped.matchLength)
  };
}
