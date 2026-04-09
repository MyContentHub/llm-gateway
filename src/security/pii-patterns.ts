export interface PIIMatch {
  type: string;
  value: string;
  start: number;
  end: number;
}

interface PatternDef {
  type: string;
  regex: RegExp;
}

const patterns: PatternDef[] = [
  {
    type: "EMAIL",
    regex: /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g,
  },
  {
    type: "SSN",
    regex: /\b(?!000|666|9\d{2})\d{3}-(?!00)\d{2}-(?!0000)\d{4}\b/g,
  },
  {
    type: "CN_ID",
    regex: /\b[1-9]\d{5}(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx]\b/g,
  },
  {
    type: "PHONE",
    regex: /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b|\b1[3-9]\d{9}\b/g,
  },
  {
    type: "CREDIT_CARD",
    regex: /\b(?:\d[ -]*?){13,19}\b/g,
  },
  {
    type: "BANK_CARD",
    regex: /\b(?:\d[ -]*?){16,19}\b/g,
  },
  {
    type: "IP_ADDRESS",
    regex: /\b(?:(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)\b/g,
  },
  {
    type: "DATE_OF_BIRTH",
    regex: /\b(?:\d{4}[-/](?:0[1-9]|1[0-2])[-/](?:0[1-9]|[12]\d|3[01])|\b(?:0[1-9]|1[0-2])[-/](?:0[1-9]|[12]\d|3[01])[-/]\d{4})\b/g,
  },
];

function isValidCreditCard(digits: string): boolean {
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let alternate = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = parseInt(digits[i], 10);
    if (alternate) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    alternate = !alternate;
  }
  return sum % 10 === 0;
}

function extractDigits(s: string): string {
  return s.replace(/\D/g, "");
}

export function scanPII(text: string): PIIMatch[] {
  const matches: PIIMatch[] = [];

  for (const pattern of patterns) {
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      const value = match[0];
      let valid = true;

      if (pattern.type === "CREDIT_CARD") {
        const digits = extractDigits(value);
        if (!isValidCreditCard(digits)) valid = false;
      }

      if (pattern.type === "BANK_CARD") {
        const digits = extractDigits(value);
        if (digits.length < 16 || digits.length > 19) valid = false;
      }

      if (valid) {
        matches.push({
          type: pattern.type,
          value,
          start: match.index,
          end: match.index + value.length,
        });
      }
    }
  }

  matches.sort((a, b) => a.start - b.start);

  const deduped: PIIMatch[] = [];
  for (const m of matches) {
    const overlaps = deduped.some(
      (d) => m.start < d.end && m.end > d.start,
    );
    if (!overlaps) {
      deduped.push(m);
    }
  }

  return deduped;
}

export function createPlaceholderNamer(): (type: string) => string {
  const counters = new Map<string, number>();
  return (type: string): string => {
    const count = (counters.get(type) ?? 0) + 1;
    counters.set(type, count);
    return `[${type}_${count}]`;
  };
}
