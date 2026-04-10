export interface ModelPricing {
  input: number;
  output: number;
}

const BUILT_IN_PRICING: Record<string, ModelPricing> = {
  "gpt-4o": { input: 2.5, output: 10.0 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4-turbo": { input: 10.0, output: 30.0 },
  "gpt-4": { input: 30.0, output: 60.0 },
  "gpt-3.5-turbo": { input: 0.5, output: 1.5 },
  "claude-3-opus": { input: 15.0, output: 75.0 },
  "claude-3-sonnet": { input: 3.0, output: 15.0 },
  "claude-3-haiku": { input: 0.25, output: 1.25 },
  "text-embedding-ada-002": { input: 0.1, output: 0.0 },
  "text-embedding-3-small": { input: 0.02, output: 0.0 },
  "text-embedding-3-large": { input: 0.13, output: 0.0 },
};

export function calculateCost(
  model: string,
  promptTokens: number,
  completionTokens: number,
  overrides?: Record<string, ModelPricing>,
): number {
  const pricing = overrides?.[model] ?? BUILT_IN_PRICING[model];
  if (!pricing) {
    return 0;
  }
  const inputCost = (promptTokens / 1_000_000) * pricing.input;
  const outputCost = (completionTokens / 1_000_000) * pricing.output;
  return inputCost + outputCost;
}

export { BUILT_IN_PRICING };
