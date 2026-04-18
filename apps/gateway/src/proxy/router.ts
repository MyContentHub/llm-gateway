import type { ProviderConfig } from "../config/providers.js";
import type { KeySelector } from "./key-selector.js";

export interface RouteResult {
  providerName: string;
  baseUrl: string;
  apiKey: string;
  resolvedModel: string;
}

export class RouteError extends Error {
  public readonly statusCode: number;

  constructor(message: string, statusCode = 404) {
    super(message);
    this.name = "RouteError";
    this.statusCode = statusCode;
  }
}

export function resolveRoute(
  model: string,
  providers: ProviderConfig[],
  keySelector?: KeySelector,
): RouteResult {
  for (const provider of providers) {
    const mappings = provider.modelMappings ?? {};
    if (model in mappings) {
      return {
        providerName: provider.name,
        baseUrl: provider.baseUrl,
        apiKey: keySelector
          ? keySelector.selectKey(provider)
          : provider.apiKey,
        resolvedModel: mappings[model],
      };
    }
  }

  const defaultProvider = providers.find((p) => p.isDefault) ?? providers[0];
  if (defaultProvider) {
    return {
      providerName: defaultProvider.name,
      baseUrl: defaultProvider.baseUrl,
      apiKey: keySelector
        ? keySelector.selectKey(defaultProvider)
        : defaultProvider.apiKey,
      resolvedModel: model,
    };
  }

  throw new RouteError(`No provider found for model '${model}'`);
}
