import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: async () => {},
}));
vi.mock("@upstash/redis", () => ({ Redis: class {} }));

function clearRedisEnv() {
  for (const name of [
    "UPSTASH_REDIS_REST_URL",
    "UPSTASH_REDIS_REST_TOKEN",
    "KV_REST_API_URL",
    "KV_REST_API_TOKEN",
    ...Object.keys(process.env).filter((n) => /_KV_REST_API_(URL|TOKEN)$/.test(n)),
  ]) {
    vi.stubEnv(name, "");
  }
}

beforeEach(() => {
  delete (globalThis as Record<symbol, unknown>)[Symbol.for("room-booking.memory-repository")];
  vi.resetModules();
  clearRedisEnv();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("GET /api/health", () => {
  it("memory storage without Redis env", async () => {
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(await res.json()).toEqual({ ok: true, storage: "memory" });
  });

  it("redis storage with Redis env", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://x.example");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "tok");
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(await res.json()).toEqual({ ok: true, storage: "redis" });
  });
});
