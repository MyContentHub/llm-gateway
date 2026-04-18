import { Registry, Counter, Histogram, collectDefaultMetrics } from "prom-client";
import type { FastifyInstance } from "fastify";

export interface LlmGatewayMetrics {
  registry: Registry;
  llmRequestTotal: Counter<"model" | "status" | "endpoint">;
  llmTokensTotal: Counter<"type" | "model">;
  llmRequestCostUsd: Histogram<"model">;
  llmRequestDurationSeconds: Histogram<"model" | "endpoint">;
  httpRequestsTotal: Counter<"method" | "route" | "status_code">;
  httpRequestDurationSeconds: Histogram<"method" | "route" | "status_code">;
}

export function createMetrics(): LlmGatewayMetrics {
  const registry = new Registry();

  const llmRequestTotal = new Counter({
    name: "llm_request_total",
    help: "Total number of LLM API requests",
    labelNames: ["model", "status", "endpoint"],
    registers: [registry],
  });

  const llmTokensTotal = new Counter({
    name: "llm_tokens_total",
    help: "Total number of tokens processed",
    labelNames: ["type", "model"],
    registers: [registry],
  });

  const llmRequestCostUsd = new Histogram({
    name: "llm_request_cost_usd",
    help: "Cost of LLM requests in USD",
    labelNames: ["model"],
    buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registers: [registry],
  });

  const llmRequestDurationSeconds = new Histogram({
    name: "llm_request_duration_seconds",
    help: "Duration of LLM requests in seconds",
    labelNames: ["model", "endpoint"],
    buckets: [0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60, 120],
    registers: [registry],
  });

  const httpRequestsTotal = new Counter({
    name: "http_request_total",
    help: "Total number of HTTP requests",
    labelNames: ["method", "route", "status_code"],
    registers: [registry],
  });

  const httpRequestDurationSeconds = new Histogram({
    name: "http_request_duration_seconds",
    help: "Duration of HTTP requests in seconds",
    labelNames: ["method", "route", "status_code"],
    buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registers: [registry],
  });

  return {
    registry,
    llmRequestTotal,
    llmTokensTotal,
    llmRequestCostUsd,
    llmRequestDurationSeconds,
    httpRequestsTotal,
    httpRequestDurationSeconds,
  };
}

const defaultMetrics = createMetrics();
collectDefaultMetrics({ register: defaultMetrics.registry });

function normalizeEndpoint(url: string): string {
  const pathname = url.split("?")[0];
  if (pathname.startsWith("/api/v1/chat/completions")) return "/api/v1/chat/completions";
  if (pathname.startsWith("/api/v1/completions")) return "/api/v1/completions";
  if (pathname.startsWith("/api/v1/embeddings")) return "/api/v1/embeddings";
  if (pathname.startsWith("/api/v1/models")) return "/api/v1/models";
  return pathname;
}

function isLlmRoute(url: string): boolean {
  return normalizeEndpoint(url).startsWith("/api/v1/");
}

function getModelFromBody(body: unknown): string {
  if (body && typeof body === "object" && "model" in body) {
    return String((body as Record<string, unknown>).model);
  }
  return "unknown";
}

export function setupMetrics(server: FastifyInstance, m: LlmGatewayMetrics = defaultMetrics): void {
  server.get("/metrics", async (_request, reply) => {
    const data = await m.registry.metrics();
    return reply.type(m.registry.contentType).send(data);
  });

  server.addHook("onResponse", (request, reply, done) => {
    const route = normalizeEndpoint(request.url);
    const statusCode = String(reply.statusCode);

    m.httpRequestsTotal.labels({ method: request.method, route, status_code: statusCode }).inc();
    m.httpRequestDurationSeconds
      .labels({ method: request.method, route, status_code: statusCode })
      .observe(reply.elapsedTime / 1000);

    if (isLlmRoute(request.url)) {
      const model = getModelFromBody(request.body);
      const status = reply.statusCode < 400 ? "success" : "error";
      const endpoint = normalizeEndpoint(request.url);

      m.llmRequestTotal.labels({ model, status, endpoint }).inc();
      m.llmRequestDurationSeconds.labels({ model, endpoint }).observe(reply.elapsedTime / 1000);
    }

    done();
  });
}

export function recordLlmRequest(model: string, status: string, endpoint: string): void {
  defaultMetrics.llmRequestTotal.labels({ model, status, endpoint }).inc();
}

export function recordLlmTokens(type: string, model: string, count: number): void {
  defaultMetrics.llmTokensTotal.labels({ type, model }).inc(count);
}

export function recordLlmCost(model: string, cost: number): void {
  defaultMetrics.llmRequestCostUsd.labels({ model }).observe(cost);
}

export function recordLlmDuration(model: string, endpoint: string, durationSeconds: number): void {
  defaultMetrics.llmRequestDurationSeconds.labels({ model, endpoint }).observe(durationSeconds);
}
