import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { setupGracefulShutdown } from "./graceful-shutdown.js";

function createMockServer() {
  return {
    close: vi.fn().mockResolvedValue(undefined),
    log: {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      trace: vi.fn(),
      fatal: vi.fn(),
      child: vi.fn().mockReturnThis(),
    },
  } as unknown as Parameters<typeof setupGracefulShutdown>[0];
}

describe("setupGracefulShutdown", () => {
  let mockExit: ReturnType<typeof vi.spyOn>;
  let listeners: { [event: string]: Array<(...args: unknown[]) => void> };

  beforeEach(() => {
    mockExit = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
    listeners = {};

    const origOn = process.on.bind(process) as typeof process.on;
    vi.spyOn(process, "on").mockImplementation((event: string | symbol, handler: (...args: any[]) => void) => {
      const ev = event as string;
      if (!listeners[ev]) listeners[ev] = [];
      listeners[ev].push(handler);
      return origOn(event, handler);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("registers handlers for SIGTERM, SIGINT, uncaughtException, unhandledRejection", () => {
    const server = createMockServer();
    setupGracefulShutdown(server);

    expect(process.on).toHaveBeenCalledWith("SIGTERM", expect.any(Function));
    expect(process.on).toHaveBeenCalledWith("SIGINT", expect.any(Function));
    expect(process.on).toHaveBeenCalledWith("uncaughtException", expect.any(Function));
    expect(process.on).toHaveBeenCalledWith("unhandledRejection", expect.any(Function));
  });

  it("calls server.close on SIGTERM", async () => {
    const server = createMockServer();
    setupGracefulShutdown(server);

    const handler = listeners["SIGTERM"]![0];
    await handler();

    expect(server.close).toHaveBeenCalled();
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it("calls server.close on SIGINT", async () => {
    const server = createMockServer();
    setupGracefulShutdown(server);

    const handler = listeners["SIGINT"]![0];
    await handler();

    expect(server.close).toHaveBeenCalled();
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it("logs the signal name when shutting down", async () => {
    const logger = { info: vi.fn(), error: vi.fn() };
    const server = createMockServer();
    setupGracefulShutdown(server, { logger });

    const handler = listeners["SIGTERM"]![0];
    await handler();

    expect(logger.info).toHaveBeenCalledWith("Received SIGTERM, starting graceful shutdown...");
    expect(logger.info).toHaveBeenCalledWith("Graceful shutdown complete");
  });

  it("ignores duplicate signals (isShuttingDown guard)", async () => {
    const server = createMockServer();
    setupGracefulShutdown(server);

    const handler = listeners["SIGTERM"]![0];
    await handler();

    expect(server.close).toHaveBeenCalledTimes(1);

    (server.close as ReturnType<typeof vi.fn>).mockClear();

    await handler();

    expect(server.close).not.toHaveBeenCalled();
  });

  it("exits with code 1 when server.close rejects", async () => {
    const server = createMockServer();
    (server.close as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("close failed"));
    setupGracefulShutdown(server);

    const handler = listeners["SIGTERM"]![0];
    await handler();

    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it("logs error when server.close rejects", async () => {
    const logger = { info: vi.fn(), error: vi.fn() };
    const server = createMockServer();
    const err = new Error("close failed");
    (server.close as ReturnType<typeof vi.fn>).mockRejectedValue(err);
    setupGracefulShutdown(server, { logger });

    const handler = listeners["SIGTERM"]![0];
    await handler();

    expect(logger.error).toHaveBeenCalledWith("Error during shutdown:", err);
  });

  it("forces exit with code 1 after timeout", async () => {
    vi.useFakeTimers();
    const server = createMockServer();
    (server.close as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));
    setupGracefulShutdown(server, { timeoutMs: 5000 });

    const handler = listeners["SIGTERM"]![0];
    handler();

    await vi.advanceTimersByTimeAsync(4999);
    expect(mockExit).not.toHaveBeenCalledWith(1);

    await vi.advanceTimersByTimeAsync(2);
    expect(mockExit).toHaveBeenCalledWith(1);

    vi.useRealTimers();
  });

  it("clears timeout when server.close completes before timeout", async () => {
    vi.useFakeTimers();
    const server = createMockServer();
    setupGracefulShutdown(server, { timeoutMs: 5000 });

    const handler = listeners["SIGTERM"]![0];
    handler();

    await vi.advanceTimersByTimeAsync(100);

    expect(mockExit).toHaveBeenCalledWith(0);

    await vi.advanceTimersByTimeAsync(10000);
    const exitCalls = mockExit.mock.calls.filter((c: number[]) => c[0] === 1);
    expect(exitCalls.length).toBe(0);

    vi.useRealTimers();
  });

  it("uses default timeout of 30000ms when not specified", async () => {
    vi.useFakeTimers();
    const server = createMockServer();
    (server.close as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));
    setupGracefulShutdown(server);

    const handler = listeners["SIGTERM"]![0];
    handler();

    await vi.advanceTimersByTimeAsync(29999);
    expect(mockExit).not.toHaveBeenCalledWith(1);

    await vi.advanceTimersByTimeAsync(2);
    expect(mockExit).toHaveBeenCalledWith(1);

    vi.useRealTimers();
  });

  it("handles uncaughtException by shutting down", async () => {
    const logger = { info: vi.fn(), error: vi.fn() };
    const server = createMockServer();
    setupGracefulShutdown(server, { logger });

    const handler = listeners["uncaughtException"]![0];
    const err = new Error("boom");
    await handler(err);

    expect(logger.error).toHaveBeenCalledWith("Uncaught exception:", err);
    expect(server.close).toHaveBeenCalled();
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it("handles unhandledRejection by shutting down", async () => {
    const logger = { info: vi.fn(), error: vi.fn() };
    const server = createMockServer();
    setupGracefulShutdown(server, { logger });

    const handler = listeners["unhandledRejection"]![0];
    const reason = new Error("rejected");
    await handler(reason);

    expect(logger.error).toHaveBeenCalledWith("Unhandled rejection:", reason);
    expect(server.close).toHaveBeenCalled();
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it("uses custom logger when provided", async () => {
    const logger = { info: vi.fn(), error: vi.fn() };
    const server = createMockServer();
    setupGracefulShutdown(server, { logger });

    const handler = listeners["SIGINT"]![0];
    await handler();

    expect(logger.info).toHaveBeenCalled();
  });

  it("falls back to server.log when no custom logger provided", async () => {
    const server = createMockServer();
    setupGracefulShutdown(server);

    const handler = listeners["SIGTERM"]![0];
    await handler();

    expect(server.log.info).toHaveBeenCalled();
  });

  it("in-flight request completes before shutdown (server.close resolves after requests)", async () => {
    let resolveClose!: () => void;
    const closePromise = new Promise<void>((resolve) => {
      resolveClose = resolve;
    });
    const server = createMockServer();
    (server.close as ReturnType<typeof vi.fn>).mockReturnValue(closePromise);

    setupGracefulShutdown(server);

    const handler = listeners["SIGTERM"]![0];
    const shutdownPromise = handler();

    expect(mockExit).not.toHaveBeenCalled();

    resolveClose();
    await shutdownPromise;

    expect(mockExit).toHaveBeenCalledWith(0);
  });
});
