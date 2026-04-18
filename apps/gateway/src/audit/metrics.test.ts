import { describe, it, expect, beforeEach } from "vitest";
import Fastify from "fastify";

import { createMetrics, setupMetrics } from "./metrics.js";

describe("createMetrics", () => {
  it("creates a registry with all custom metrics", async () => {
    const m = createMetrics();
    const json = await m.registry.getMetricsAsJSON();
    const names = json.map((metric) => metric.name);

    expect(names).toContain("llm_request_total");
    expect(names).toContain("llm_tokens_total");
    expect(names).toContain("llm_request_cost_usd");
    expect(names).toContain("llm_request_duration_seconds");
    expect(names).toContain("http_request_total");
    expect(names).toContain("http_request_duration_seconds");
  });

  it("each metric has correct type", async () => {
    const m = createMetrics();
    const json = await m.registry.getMetricsAsJSON();
    const byName = Object.fromEntries(json.map((metric) => [metric.name, metric]));

    expect(byName["llm_request_total"].type).toBe("counter");
    expect(byName["llm_tokens_total"].type).toBe("counter");
    expect(byName["llm_request_cost_usd"].type).toBe("histogram");
    expect(byName["llm_request_duration_seconds"].type).toBe("histogram");
    expect(byName["http_request_total"].type).toBe("counter");
    expect(byName["http_request_duration_seconds"].type).toBe("histogram");
  });

  it("returns an independent registry each time", async () => {
    const m1 = createMetrics();
    const m2 = createMetrics();

    m1.llmRequestTotal.labels({ model: "gpt-4o", status: "success", endpoint: "/v1/chat/completions" }).inc();

    const json1 = await m1.registry.getMetricsAsJSON();
    const json2 = await m2.registry.getMetricsAsJSON();

    const req1 = json1.find((m) => m.name === "llm_request_total")!;
    const req2 = json2.find((m) => m.name === "llm_request_total")!;

    expect(req1.values.length).toBeGreaterThan(0);
    expect(req2.values.length).toBe(0);
  });
});

describe("LlmGatewayMetrics counters", () => {
  let m: ReturnType<typeof createMetrics>;

  beforeEach(() => {
    m = createMetrics();
  });

  it("increments llm_request_total with correct labels", async () => {
    m.llmRequestTotal.labels({ model: "gpt-4o", status: "success", endpoint: "/v1/chat/completions" }).inc();

    const json = await m.registry.getMetricsAsJSON();
    const metric = json.find((x) => x.name === "llm_request_total")!;

    expect(metric.values).toContainEqual({
      value: 1,
      labels: { model: "gpt-4o", status: "success", endpoint: "/v1/chat/completions" },
    });
  });

  it("increments llm_request_total multiple times", async () => {
    const labels = { model: "gpt-4o", status: "success", endpoint: "/v1/chat/completions" };
    m.llmRequestTotal.labels(labels).inc();
    m.llmRequestTotal.labels(labels).inc();
    m.llmRequestTotal.labels(labels).inc();

    const json = await m.registry.getMetricsAsJSON();
    const metric = json.find((x) => x.name === "llm_request_total")!;

    expect(metric.values).toContainEqual({ value: 3, labels });
  });

  it("tracks different label combinations independently", async () => {
    m.llmRequestTotal.labels({ model: "gpt-4o", status: "success", endpoint: "/v1/chat/completions" }).inc();
    m.llmRequestTotal.labels({ model: "gpt-4o", status: "error", endpoint: "/v1/chat/completions" }).inc();
    m.llmRequestTotal.labels({ model: "claude-3", status: "success", endpoint: "/v1/chat/completions" }).inc();

    const json = await m.registry.getMetricsAsJSON();
    const metric = json.find((x) => x.name === "llm_request_total")!;

    expect(metric.values.length).toBe(3);
    expect(metric.values).toContainEqual({
      value: 1,
      labels: { model: "gpt-4o", status: "success", endpoint: "/v1/chat/completions" },
    });
    expect(metric.values).toContainEqual({
      value: 1,
      labels: { model: "gpt-4o", status: "error", endpoint: "/v1/chat/completions" },
    });
    expect(metric.values).toContainEqual({
      value: 1,
      labels: { model: "claude-3", status: "success", endpoint: "/v1/chat/completions" },
    });
  });

  it("increments llm_tokens_total for prompt tokens", async () => {
    m.llmTokensTotal.labels({ type: "prompt", model: "gpt-4o" }).inc(100);

    const json = await m.registry.getMetricsAsJSON();
    const metric = json.find((x) => x.name === "llm_tokens_total")!;

    expect(metric.values).toContainEqual({
      value: 100,
      labels: { type: "prompt", model: "gpt-4o" },
    });
  });

  it("increments llm_tokens_total for completion tokens", async () => {
    m.llmTokensTotal.labels({ type: "prompt", model: "gpt-4o" }).inc(100);
    m.llmTokensTotal.labels({ type: "completion", model: "gpt-4o" }).inc(50);

    const json = await m.registry.getMetricsAsJSON();
    const metric = json.find((x) => x.name === "llm_tokens_total")!;

    expect(metric.values).toContainEqual({ value: 100, labels: { type: "prompt", model: "gpt-4o" } });
    expect(metric.values).toContainEqual({ value: 50, labels: { type: "completion", model: "gpt-4o" } });
  });
});

describe("LlmGatewayMetrics histograms", () => {
  let m: ReturnType<typeof createMetrics>;

  beforeEach(() => {
    m = createMetrics();
  });

  it("observes llm_request_cost_usd values", async () => {
    m.llmRequestCostUsd.labels({ model: "gpt-4o" }).observe(0.05);

    const json = await m.registry.getMetricsAsJSON();
    const metric = json.find((x) => x.name === "llm_request_cost_usd")!;

    const sum = metric.values.find(
      (v) => "model" in v.labels && v.labels.model === "gpt-4o" && !("le" in v.labels),
    );
    expect(sum!.value).toBeCloseTo(0.05, 4);
  });

  it("accumulates multiple cost observations", async () => {
    m.llmRequestCostUsd.labels({ model: "gpt-4o" }).observe(0.05);
    m.llmRequestCostUsd.labels({ model: "gpt-4o" }).observe(0.10);

    const json = await m.registry.getMetricsAsJSON();
    const metric = json.find((x) => x.name === "llm_request_cost_usd")!;

    const sum = metric.values.find(
      (v) => "model" in v.labels && v.labels.model === "gpt-4o" && !("le" in v.labels),
    );
    expect(sum!.value).toBeCloseTo(0.15, 4);

    const count = metric.values.find(
      (v) => "model" in v.labels && v.labels.model === "gpt-4o" && v.labels.le === "+Inf",
    );
    expect(count!.value).toBe(2);
  });

  it("observes llm_request_duration_seconds values", async () => {
    m.llmRequestDurationSeconds.labels({ model: "gpt-4o", endpoint: "/v1/chat/completions" }).observe(1.5);

    const json = await m.registry.getMetricsAsJSON();
    const metric = json.find((x) => x.name === "llm_request_duration_seconds")!;

    const sum = metric.values.find(
      (v) =>
        "model" in v.labels &&
        v.labels.model === "gpt-4o" &&
        "endpoint" in v.labels &&
        v.labels.endpoint === "/v1/chat/completions" &&
        !("le" in v.labels),
    );
    expect(sum!.value).toBeCloseTo(1.5, 4);
  });

  it("records 5 observations in llm_request_duration_seconds", async () => {
    const labels = { model: "gpt-4o", endpoint: "/v1/chat/completions" };
    for (let i = 0; i < 5; i++) {
      m.llmRequestDurationSeconds.labels(labels).observe(0.1 * (i + 1));
    }

    const json = await m.registry.getMetricsAsJSON();
    const metric = json.find((x) => x.name === "llm_request_duration_seconds")!;

    const count = metric.values.find(
      (v) =>
        "model" in v.labels &&
        v.labels.model === "gpt-4o" &&
        "endpoint" in v.labels &&
        v.labels.endpoint === "/v1/chat/completions" &&
        v.labels.le === "+Inf",
    );
    expect(count!.value).toBe(5);
  });

  it("tracks HTTP request duration by method, route, and status", async () => {
    m.httpRequestDurationSeconds.labels({ method: "GET", route: "/health", status_code: "200" }).observe(0.01);

    const json = await m.registry.getMetricsAsJSON();
    const metric = json.find((x) => x.name === "http_request_duration_seconds")!;

    const sum = metric.values.find(
      (v) =>
        "method" in v.labels &&
        v.labels.method === "GET" &&
        "route" in v.labels &&
        v.labels.route === "/health" &&
        !("le" in v.labels),
    );
    expect(sum!.value).toBeCloseTo(0.01, 4);
  });
});

describe("setupMetrics", () => {
  it("exposes GET /metrics endpoint returning Prometheus text format", async () => {
    const m = createMetrics();
    const server = Fastify({ logger: false });
    setupMetrics(server, m);

    const response = await server.inject({ method: "GET", url: "/metrics" });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/plain");
    expect(response.body).toContain("llm_request_total");
    expect(response.body).toContain("llm_tokens_total");
    expect(response.body).toContain("llm_request_cost_usd");
    expect(response.body).toContain("llm_request_duration_seconds");
    expect(response.body).toContain("http_request_total");
    expect(response.body).toContain("http_request_duration_seconds");

    await server.close();
  });

  it("records HTTP metrics on onResponse for non-LLM routes", async () => {
    const m = createMetrics();
    const server = Fastify({ logger: false });
    setupMetrics(server, m);

    server.get("/health", async () => ({ status: "ok" }));

    await server.inject({ method: "GET", url: "/health" });

    const json = await m.registry.getMetricsAsJSON();
    const httpTotal = json.find((x) => x.name === "http_request_total")!;
    expect(httpTotal.values).toContainEqual({
      value: 1,
      labels: { method: "GET", route: "/health", status_code: "200" },
    });

    await server.close();
  });

  it("records LLM metrics on onResponse for LLM routes on success", async () => {
    const m = createMetrics();
    const server = Fastify({ logger: false });
    setupMetrics(server, m);

    server.post("/api/v1/chat/completions", async (request, reply) => {
      return reply.code(200).send({ ok: true });
    });

    await server.inject({
      method: "POST",
      url: "/api/v1/chat/completions",
      payload: { model: "gpt-4o", messages: [{ role: "user", content: "Hi" }] },
    });

    const json = await m.registry.getMetricsAsJSON();

    const llmTotal = json.find((x) => x.name === "llm_request_total")!;
    expect(llmTotal.values).toContainEqual({
      value: 1,
      labels: { model: "gpt-4o", status: "success", endpoint: "/api/v1/chat/completions" },
    });

    const httpTotal = json.find((x) => x.name === "http_request_total")!;
    expect(httpTotal.values).toContainEqual({
      value: 1,
      labels: { method: "POST", route: "/api/v1/chat/completions", status_code: "200" },
    });

    await server.close();
  });

  it("records LLM metrics with error status for non-2xx responses", async () => {
    const m = createMetrics();
    const server = Fastify({ logger: false });
    setupMetrics(server, m);

    server.post("/api/v1/chat/completions", async (request, reply) => {
      return reply.code(400).send({ error: "bad request" });
    });

    await server.inject({
      method: "POST",
      url: "/api/v1/chat/completions",
      payload: { model: "gpt-4o", messages: [] },
    });

    const json = await m.registry.getMetricsAsJSON();
    const llmTotal = json.find((x) => x.name === "llm_request_total")!;
    expect(llmTotal.values).toContainEqual({
      value: 1,
      labels: { model: "gpt-4o", status: "error", endpoint: "/api/v1/chat/completions" },
    });

    await server.close();
  });

  it("uses unknown model when body has no model field", async () => {
    const m = createMetrics();
    const server = Fastify({ logger: false });
    setupMetrics(server, m);

    server.post("/api/v1/chat/completions", async (request, reply) => {
      return reply.code(200).send({});
    });

    await server.inject({
      method: "POST",
      url: "/api/v1/chat/completions",
      payload: { messages: [{ role: "user", content: "Hi" }] },
    });

    const json = await m.registry.getMetricsAsJSON();
    const llmTotal = json.find((x) => x.name === "llm_request_total")!;
    expect(llmTotal.values).toContainEqual({
      value: 1,
      labels: { model: "unknown", status: "success", endpoint: "/api/v1/chat/completions" },
    });

    await server.close();
  });

  it("records duration observations for LLM routes", async () => {
    const m = createMetrics();
    const server = Fastify({ logger: false });
    setupMetrics(server, m);

    server.post("/api/v1/chat/completions", async (request, reply) => {
      return reply.code(200).send({});
    });

    await server.inject({
      method: "POST",
      url: "/api/v1/chat/completions",
      payload: { model: "gpt-4o", messages: [] },
    });

    const json = await m.registry.getMetricsAsJSON();
    const llmDuration = json.find((x) => x.name === "llm_request_duration_seconds")!;

    const obs = llmDuration.values.find(
      (v) =>
        "model" in v.labels &&
        v.labels.model === "gpt-4o" &&
        "endpoint" in v.labels &&
        v.labels.endpoint === "/api/v1/chat/completions" &&
        v.labels.le === "+Inf",
    );
    expect(obs!.value).toBe(1);

    await server.close();
  });

  it("records multiple requests accumulating correctly", async () => {
    const m = createMetrics();
    const server = Fastify({ logger: false });
    setupMetrics(server, m);

    server.post("/api/v1/chat/completions", async (request, reply) => {
      return reply.code(200).send({});
    });
    server.get("/api/v1/models", async () => ({ data: [] }));

    await server.inject({
      method: "POST",
      url: "/api/v1/chat/completions",
      payload: { model: "gpt-4o", messages: [] },
    });
    await server.inject({
      method: "POST",
      url: "/api/v1/chat/completions",
      payload: { model: "gpt-4o", messages: [] },
    });
    await server.inject({ method: "GET", url: "/api/v1/models" });

    const json = await m.registry.getMetricsAsJSON();

    const llmTotal = json.find((x) => x.name === "llm_request_total")!;
    expect(
      llmTotal.values.find(
        (v) =>
          v.labels.model === "gpt-4o" &&
          v.labels.status === "success" &&
          v.labels.endpoint === "/api/v1/chat/completions",
      )!.value,
    ).toBe(2);

    expect(
      llmTotal.values.find(
        (v) =>
          v.labels.model === "unknown" &&
          v.labels.status === "success" &&
          v.labels.endpoint === "/api/v1/models",
      )!.value,
    ).toBe(1);

    const httpTotal = json.find((x) => x.name === "http_request_total")!;
    expect(httpTotal.values.reduce((sum, v) => sum + v.value, 0)).toBe(3);

    await server.close();
  });

  it("does not record LLM metrics for /metrics and /health routes", async () => {
    const m = createMetrics();
    const server = Fastify({ logger: false });
    setupMetrics(server, m);

    server.get("/health", async () => ({ status: "ok" }));

    await server.inject({ method: "GET", url: "/metrics" });
    await server.inject({ method: "GET", url: "/health" });

    const json = await m.registry.getMetricsAsJSON();
    const llmTotal = json.find((x) => x.name === "llm_request_total")!;
    expect(llmTotal.values.length).toBe(0);

    const httpTotal = json.find((x) => x.name === "http_request_total")!;
    expect(httpTotal.values.reduce((sum, v) => sum + v.value, 0)).toBe(2);

    await server.close();
  });

  it("/metrics output includes HELP and TYPE lines for all custom metrics", async () => {
    const m = createMetrics();
    const server = Fastify({ logger: false });
    setupMetrics(server, m);

    const response = await server.inject({ method: "GET", url: "/metrics" });
    const body = response.body;

    expect(body).toContain("# HELP llm_request_total Total number of LLM API requests");
    expect(body).toContain("# TYPE llm_request_total counter");
    expect(body).toContain("# HELP llm_tokens_total Total number of tokens processed");
    expect(body).toContain("# TYPE llm_tokens_total counter");
    expect(body).toContain("# HELP llm_request_cost_usd Cost of LLM requests in USD");
    expect(body).toContain("# TYPE llm_request_cost_usd histogram");
    expect(body).toContain("# HELP llm_request_duration_seconds Duration of LLM requests in seconds");
    expect(body).toContain("# TYPE llm_request_duration_seconds histogram");
    expect(body).toContain("# HELP http_request_total Total number of HTTP requests");
    expect(body).toContain("# TYPE http_request_total counter");
    expect(body).toContain("# HELP http_request_duration_seconds Duration of HTTP requests in seconds");
    expect(body).toContain("# TYPE http_request_duration_seconds histogram");

    await server.close();
  });
});
