export type HookPoint = "onRequest" | "preProxy" | "onResponse" | "onError";

export interface HookContext {
  request?: unknown;
  reply?: unknown;
  body?: unknown;
  headers?: Record<string, string>;
  status?: number;
  error?: Error;
  [key: string]: unknown;
}

export type HookFn = (context: HookContext) => Promise<void> | void;

export class HookManager {
  private hooks: Map<HookPoint, HookFn[]>;

  constructor() {
    this.hooks = new Map<HookPoint, HookFn[]>([
      ["onRequest", []],
      ["preProxy", []],
      ["onResponse", []],
      ["onError", []],
    ]);
  }

  register(point: HookPoint, fn: HookFn): void {
    this.hooks.get(point)?.push(fn);
  }

  async execute(point: HookPoint, context: HookContext): Promise<void> {
    const fns = this.hooks.get(point) ?? [];
    for (const fn of fns) {
      try {
        await fn(context);
      } catch (err) {
        console.error(`Hook error at ${point}:`, err);
      }
    }
  }

  getHooks(point: HookPoint): HookFn[] {
    return this.hooks.get(point) ?? [];
  }

  clear(): void {
    for (const fns of this.hooks.values()) {
      fns.length = 0;
    }
  }
}
