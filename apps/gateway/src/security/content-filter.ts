export interface PromptInjectionResult {
  score: number;
  detected: boolean;
  matchedPatterns: string[];
}

interface InjectionPattern {
  regex: RegExp;
  name: string;
  weight: number;
}

const DEFAULT_THRESHOLD = 0.5;
const CONTEXT_DAMPENING_FACTOR = 0.5;
const MULTI_MATCH_BONUS = 0.15;
const MULTI_MATCH_THRESHOLD = 3;

const PATTERNS: InjectionPattern[] = [
  {
    regex: /ignore\s+(all\s+)?(previous|above|prior)\s+(instructions?|prompts?|rules?|directives?)/i,
    name: "ignore-previous-instructions",
    weight: 0.35,
  },
  {
    regex: /disregard\s+(all|previous|above|prior|everything)/i,
    name: "disregard-instructions",
    weight: 0.3,
  },
  {
    regex: /forget\s+(everything|all|your\s+(instructions?|prompt|rules?))/i,
    name: "forget-instructions",
    weight: 0.3,
  },
  {
    regex: /bypass\s+(your|the|all)?\s*(restrictions?|filters?|safety|rules?|guidelines?)/i,
    name: "bypass-restrictions",
    weight: 0.3,
  },
  {
    regex: /system\s+prompt/i,
    name: "system-prompt",
    weight: 0.2,
  },
  {
    regex: /you\s+are\s+now/i,
    name: "you-are-now",
    weight: 0.2,
  },
  {
    regex: /pretend\s+(you\s+are|to\s+be)/i,
    name: "pretend-role",
    weight: 0.25,
  },
  {
    regex: /do\s+anything\s+now/i,
    name: "do-anything-now",
    weight: 0.3,
  },
  {
    regex: /\bdan\b/i,
    name: "dan-reference",
    weight: 0.15,
  },
  {
    regex: /reveal\s+(?:your\s+|the\s+)?(?:system\s+)?(?:prompt|instructions?|rules?)/i,
    name: "reveal-prompt",
    weight: 0.3,
  },
  {
    regex: /jailbreak/i,
    name: "jailbreak",
    weight: 0.2,
  },
  {
    regex: /developer\s+mode/i,
    name: "developer-mode",
    weight: 0.25,
  },
  {
    regex: /override\s+(your|the|all)\s+(instructions?|rules?|directives?|settings?)/i,
    name: "override-instructions",
    weight: 0.3,
  },
  {
    regex: /new\s+(instructions?|rules?|directives?)/i,
    name: "new-instructions",
    weight: 0.2,
  },
  {
    regex: /act\s+as\s+if\s+you\s+(are|were|have\s+no)/i,
    name: "act-as-if",
    weight: 0.2,
  },
  {
    regex: /you\s+(?:are|'re)\s+no\s+longer/i,
    name: "you-are-no-longer",
    weight: 0.2,
  },
  {
    regex: /sudo\s+mode/i,
    name: "sudo-mode",
    weight: 0.15,
  },
  {
    regex: /stop\s+being\s+(a|an|your)/i,
    name: "stop-being",
    weight: 0.2,
  },
];

const CONTEXT_FRAMES = [
  /translate\s+(the\s+)?following/i,
  /summarize\s+(the\s+)?following/i,
  /here\s+is\s+(a\s+)?text/i,
  /in\s+the\s+text\s+below/i,
];

export function checkPromptInjection(
  text: string,
  threshold: number = DEFAULT_THRESHOLD,
): PromptInjectionResult {
  const matchedPatterns: string[] = [];
  let score = 0;

  for (const pattern of PATTERNS) {
    if (pattern.regex.test(text)) {
      matchedPatterns.push(pattern.name);
      score += pattern.weight;
    }
  }

  if (matchedPatterns.length >= MULTI_MATCH_THRESHOLD) {
    score += MULTI_MATCH_BONUS;
  }

  const hasContextFrame = CONTEXT_FRAMES.some((frame) => frame.test(text));
  if (hasContextFrame && matchedPatterns.length > 0) {
    score *= CONTEXT_DAMPENING_FACTOR;
  }

  score = Math.min(score, 1.0);

  return {
    score,
    detected: score >= threshold,
    matchedPatterns,
  };
}
