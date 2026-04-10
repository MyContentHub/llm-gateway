import { describe, it, expect } from "vitest";
import { HookManager } from "./index.js";
import type { HookContext, HookPoint } from "./index.js";

describe("HookManager", () => {
  it("registers and retrieves hooks", () => {
    const manager = new HookManager();
    const fn = async () => {};
    manager.register("onRequest", fn);
    expect(manager.getHooks("onRequest")).toEqual([fn]);
  });

  it("registers multiple hooks at the same point", () => {
    const manager = new HookManager();
    const fn1 = async () => {};
    const fn2 = async () => {};
    const fn3 = async () => {};
    manager.register("onRequest", fn1);
    manager.register("onRequest", fn2);
    manager.register("onRequest", fn3);
    expect(manager.getHooks("onRequest")).toEqual([fn1, fn2, fn3]);
  });

  it("returns empty array for point with no hooks", () => {
    const manager = new HookManager();
    expect(manager.getHooks("onRequest")).toEqual([]);
  });

  it("executes hooks in registration order", async () => {
    const manager = new HookManager();
    const order: number[] = [];
    manager.register("preProxy", async () => { order.push(1); });
    manager.register("preProxy", async () => { order.push(2); });
    manager.register("preProxy", async () => { order.push(3); });
    await manager.execute("preProxy", {});
    expect(order).toEqual([1, 2, 3]);
  });

  it("executes hooks at different lifecycle points independently", async () => {
    const manager = new HookManager();
    const onRequestCalls: string[] = [];
    const onResponseCalls: string[] = [];
    manager.register("onRequest", async () => { onRequestCalls.push("a"); });
    manager.register("onResponse", async () => { onResponseCalls.push("b"); });
    await manager.execute("onRequest", {});
    expect(onRequestCalls).toEqual(["a"]);
    expect(onResponseCalls).toEqual([]);
    await manager.execute("onResponse", {});
    expect(onResponseCalls).toEqual(["b"]);
  });

  it("passes context to hooks and allows mutation", async () => {
    const manager = new HookManager();
    manager.register("preProxy", async (ctx) => {
      ctx.headers = { ...(ctx.headers ?? {}), "X-Custom": "value" };
    });
    manager.register("preProxy", async (ctx) => {
      ctx.headers!["X-Another"] = "value2";
    });
    const ctx: HookContext = {};
    await manager.execute("preProxy", ctx);
    expect(ctx.headers).toEqual({ "X-Custom": "value", "X-Another": "value2" });
  });

  it("continues executing hooks after one throws (fault-tolerant)", async () => {
    const manager = new HookManager();
    const order: number[] = [];
    manager.register("onResponse", async () => { order.push(1); });
    manager.register("onResponse", async () => { throw new Error("boom"); });
    manager.register("onResponse", async () => { order.push(3); });
    await manager.execute("onResponse", {});
    expect(order).toEqual([1, 3]);
  });

  it("handles sync hooks", async () => {
    const manager = new HookManager();
    const calls: number[] = [];
    manager.register("onError", () => { calls.push(1); });
    manager.register("onError", () => { calls.push(2); });
    await manager.execute("onError", {});
    expect(calls).toEqual([1, 2]);
  });

  it("handles async hooks", async () => {
    const manager = new HookManager();
    const calls: number[] = [];
    manager.register("onRequest", async () => {
      await new Promise((r) => setTimeout(r, 5));
      calls.push(1);
    });
    manager.register("onRequest", async () => { calls.push(2); });
    await manager.execute("onRequest", {});
    expect(calls).toEqual([1, 2]);
  });

  it("does nothing when executing a point with no hooks", async () => {
    const manager = new HookManager();
    await expect(manager.execute("onRequest", {})).resolves.toBeUndefined();
  });

  it("clears all hooks", () => {
    const manager = new HookManager();
    manager.register("onRequest", async () => {});
    manager.register("preProxy", async () => {});
    manager.register("onResponse", async () => {});
    manager.register("onError", async () => {});
    manager.clear();
    const points: HookPoint[] = ["onRequest", "preProxy", "onResponse", "onError"];
    for (const point of points) {
      expect(manager.getHooks(point)).toEqual([]);
    }
  });

  it("provides error context to onError hooks", async () => {
    const manager = new HookManager();
    let capturedError: Error | undefined;
    manager.register("onError", async (ctx) => {
      capturedError = ctx.error;
    });
    const err = new Error("upstream failure");
    await manager.execute("onError", { error: err });
    expect(capturedError).toBe(err);
  });

  it("allows custom properties on context", async () => {
    const manager = new HookManager();
    let captured: unknown;
    manager.register("onRequest", async (ctx) => {
      captured = ctx["customKey"];
    });
    await manager.execute("onRequest", { customKey: "customValue" });
    expect(captured).toBe("customValue");
  });

  it("supports body transformation via onResponse hook", async () => {
    const manager = new HookManager();
    manager.register("onResponse", async (ctx) => {
      const body = ctx.body as { result: string };
      ctx.body = { ...body, transformed: true };
    });
    const ctx: HookContext = { body: { result: "original" } };
    await manager.execute("onResponse", ctx);
    expect(ctx.body).toEqual({ result: "original", transformed: true });
  });

  it("handles mixed sync and async hooks", async () => {
    const manager = new HookManager();
    const order: string[] = [];
    manager.register("onRequest", () => { order.push("sync"); });
    manager.register("onRequest", async () => { order.push("async"); });
    manager.register("onRequest", () => { order.push("sync2"); });
    await manager.execute("onRequest", {});
    expect(order).toEqual(["sync", "async", "sync2"]);
  });
});
