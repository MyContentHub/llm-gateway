import { scanPii, type PIIMatch } from "./pii-scanner.js";
import {
  checkPromptInjection,
  type PromptInjectionResult,
} from "./content-filter.js";

export interface ContentFilterConfig {
  injection_threshold: number;
  blocked_pii_types: string[];
  flagged_pii_types: string[];
}

export interface ContentFilterResult {
  action: "allow" | "block" | "flag";
  reason?: string;
  piiTypes?: string[];
  injectionScore?: number;
}

const DEFAULT_CONFIG: ContentFilterConfig = {
  injection_threshold: 0.5,
  blocked_pii_types: ["SSN", "CREDIT_CARD"],
  flagged_pii_types: ["EMAIL", "PHONE", "CN_ID", "BANK_CARD", "IP_ADDRESS", "DATE_OF_BIRTH", "PERSON", "PLACE", "ORGANIZATION"],
};

export function createContentFilter(
  rules: Partial<ContentFilterConfig> = {},
): (requestContent: string) => ContentFilterResult {
  const config: ContentFilterConfig = {
    injection_threshold: rules.injection_threshold ?? DEFAULT_CONFIG.injection_threshold,
    blocked_pii_types: rules.blocked_pii_types ?? DEFAULT_CONFIG.blocked_pii_types,
    flagged_pii_types: rules.flagged_pii_types ?? DEFAULT_CONFIG.flagged_pii_types,
  };

  return function check(requestContent: string): ContentFilterResult {
    const piiMatches: PIIMatch[] = scanPii(requestContent);
    const injectionResult: PromptInjectionResult = checkPromptInjection(
      requestContent,
      config.injection_threshold,
    );

    if (injectionResult.score >= config.injection_threshold) {
      return {
        action: "block",
        reason: `Prompt injection score ${injectionResult.score.toFixed(2)} exceeds threshold ${config.injection_threshold}`,
        injectionScore: injectionResult.score,
      };
    }

    const piiTypes = [...new Set(piiMatches.map((m) => m.type))];
    const blocked = piiTypes.filter((t) =>
      config.blocked_pii_types.includes(t),
    );

    if (blocked.length > 0) {
      return {
        action: "block",
        reason: `Blocked PII types detected: ${blocked.join(", ")}`,
        piiTypes,
      };
    }

    const flagged = piiTypes.filter((t) =>
      config.flagged_pii_types.includes(t),
    );

    if (flagged.length > 0) {
      return {
        action: "flag",
        reason: `Flagged PII types detected: ${flagged.join(", ")}`,
        piiTypes,
        injectionScore: injectionResult.score,
      };
    }

    return {
      action: "allow",
      injectionScore: injectionResult.score,
    };
  };
}
