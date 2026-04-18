import nlp from "compromise";
import { scanPII, type PIIMatch } from "./pii-patterns.js";

{
  const w = "John Smith went to New York to work at Google Inc. ".repeat(50);
  nlp(w).json();
}

const NLP_SPECIFICITY: Record<string, number> = {
  PERSON: 1,
  PLACE: 1,
  ORGANIZATION: 1,
  EMAIL: 3,
  SSN: 3,
  CN_ID: 3,
  PHONE: 3,
  CREDIT_CARD: 3,
  BANK_CARD: 3,
  IP_ADDRESS: 2,
  DATE_OF_BIRTH: 2,
};

function computeGaps(
  text: string,
  matches: PIIMatch[],
): { start: number; end: number }[] {
  if (matches.length === 0) return [{ start: 0, end: text.length }];

  const gaps: { start: number; end: number }[] = [];
  const sorted = [...matches].sort((a, b) => a.start - b.start);
  let cursor = 0;

  for (const m of sorted) {
    if (cursor < m.start) {
      gaps.push({ start: cursor, end: m.start });
    }
    cursor = Math.max(cursor, m.end);
  }

  if (cursor < text.length) {
    gaps.push({ start: cursor, end: text.length });
  }

  return gaps;
}

interface GapMapping {
  start: number;
  end: number;
  origStart: number;
}

function extractNlpEntities(
  text: string,
  gaps: { start: number; end: number }[],
): PIIMatch[] {
  const mappings: GapMapping[] = [];
  let concatenated = "";

  for (const gap of gaps) {
    const segment = text.slice(gap.start, gap.end);
    if (!segment.trim()) continue;
    mappings.push({
      start: concatenated.length,
      end: concatenated.length + segment.length,
      origStart: gap.start,
    });
    concatenated += segment;
  }

  if (!concatenated) return [];

  const doc = nlp(concatenated);
  const sentences = doc.json();
  const results: PIIMatch[] = [];

  for (const sentence of sentences) {
    let pos = 0;
    let i = 0;
    const terms = sentence.terms as Array<{
      text: string;
      pre: string;
      post: string;
      tags: string[];
    }>;

    while (i < terms.length) {
      const term = terms[i];
      pos += term.pre.length;
      const termStart = pos;
      pos += term.text.length;
      const termEnd = pos;
      pos += term.post.length;

      let entityType: string | null = null;
      if (term.tags.includes("Person")) entityType = "PERSON";
      else if (term.tags.includes("Place")) entityType = "PLACE";
      else if (term.tags.includes("Organization")) entityType = "ORGANIZATION";

      if (entityType) {
        let entityEnd = termEnd;
        let j = i + 1;
        while (j < terms.length) {
          const next = terms[j];
          let nextType: string | null = null;
          if (next.tags.includes("Person")) nextType = "PERSON";
          else if (next.tags.includes("Place")) nextType = "PLACE";
          else if (next.tags.includes("Organization"))
            nextType = "ORGANIZATION";
          if (nextType !== entityType) break;
          pos += next.pre.length;
          pos += next.text.length;
          entityEnd = pos;
          pos += next.post.length;
          j++;
        }

        const mapping = mappings.find(
          (m) => termStart >= m.start && entityEnd <= m.end,
        );
        if (mapping) {
          results.push({
            type: entityType,
            value: concatenated.slice(termStart, entityEnd),
            start: mapping.origStart + (termStart - mapping.start),
            end: mapping.origStart + (entityEnd - mapping.start),
          });
        }
        i = j;
      } else {
        i++;
      }
    }
  }

  return results;
}

function overlaps(a: PIIMatch, b: PIIMatch): boolean {
  return a.start < b.end && a.end > b.start;
}

function deduplicate(matches: PIIMatch[]): PIIMatch[] {
  const sorted = [...matches].sort((a, b) => {
    const specificityDiff =
      (NLP_SPECIFICITY[b.type] ?? 0) - (NLP_SPECIFICITY[a.type] ?? 0);
    if (specificityDiff !== 0) return specificityDiff;
    return b.end - b.start - (a.end - a.start);
  });

  const kept: PIIMatch[] = [];
  const removed = new Set<number>();

  for (let i = 0; i < sorted.length; i++) {
    if (removed.has(i)) continue;
    kept.push(sorted[i]);
    for (let j = i + 1; j < sorted.length; j++) {
      if (!removed.has(j) && overlaps(sorted[i], sorted[j])) {
        removed.add(j);
      }
    }
  }

  return kept.sort((a, b) => a.start - b.start);
}

export function scanPii(text: string): PIIMatch[] {
  if (!text) return [];

  const regexMatches = scanPII(text);
  const gaps = computeGaps(text, regexMatches);
  const nlpMatches = extractNlpEntities(text, gaps);
  const all = [...regexMatches, ...nlpMatches];

  return deduplicate(all);
}

export type { PIIMatch };
