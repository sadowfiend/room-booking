import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { REDIS_ENV_PAIRS, resolveRedisEnv } from "./repository-factory";

const redisCtor = vi.hoisted(() => vi.fn());
vi.mock("@upstash/redis", () => ({
  Redis: class {
    constructor(opts: unknown) {
      redisCtor(opts);
    }
  },
}));

describe("resolveRedisEnv", () => {
  it("lists pairs in priority order", () => {
    expect(REDIS_ENV_PAIRS.map((p) => p.url)).toEqual([
      "UPSTASH_REDIS_REST_URL",
      "KV_REST_API_URL",
      "_KV_REST_API_URL",
    ]);
  });

  it("Upstash pair is found", () => {
    expect(
      resolveRedisEnv({ UPSTASH_REDIS_REST_URL: "u", UPSTASH_REDIS_REST_TOKEN: "t" }),
    ).toEqual({
      status: "found",
      url: "u",
      token: "t",
      urlName: "UPSTASH_REDIS_REST_URL",
      tokenName: "UPSTASH_REDIS_REST_TOKEN",
    });
  });

  it("Upstash beats KV beats prefixed", () => {
    const all = {
      UPSTASH_REDIS_REST_URL: "u1",
      UPSTASH_REDIS_REST_TOKEN: "t1",
      KV_REST_API_URL: "u2",
      KV_REST_API_TOKEN: "t2",
      APP_KV_REST_API_URL: "u3",
      APP_KV_REST_API_TOKEN: "t3",
    };
    expect(resolveRedisEnv(all)).toMatchObject({ status: "found", url: "u1", token: "t1" });
    const noUpstash: Record<string, string | undefined> = { ...all };
    delete noUpstash.UPSTASH_REDIS_REST_URL;
    delete noUpstash.UPSTASH_REDIS_REST_TOKEN;
    expect(resolveRedisEnv(noUpstash)).toMatchObject({
      status: "found",
      url: "u2",
      token: "t2",
      urlName: "KV_REST_API_URL",
      tokenName: "KV_REST_API_TOKEN",
    });
    const onlyPrefixed = { ...noUpstash };
    delete onlyPrefixed.KV_REST_API_URL;
    delete onlyPrefixed.KV_REST_API_TOKEN;
    expect(resolveRedisEnv(onlyPrefixed)).toMatchObject({ status: "found", url: "u3", token: "t3" });
  });

  it("never mixes URL and token of different pairs", () => {
    expect(
      resolveRedisEnv({ UPSTASH_REDIS_REST_URL: "u", KV_REST_API_TOKEN: "t" }),
    ).toEqual({ status: "none" });
  });

  it("an incomplete Upstash pair falls through to a full KV pair", () => {
    expect(
      resolveRedisEnv({
        UPSTASH_REDIS_REST_URL: "u",
        KV_REST_API_URL: "ku",
        KV_REST_API_TOKEN: "kt",
      }),
    ).toMatchObject({ status: "found", url: "ku", token: "kt" });
  });

  it("empty strings are treated as absent", () => {
    expect(
      resolveRedisEnv({ UPSTASH_REDIS_REST_URL: "", UPSTASH_REDIS_REST_TOKEN: "t" }),
    ).toEqual({ status: "none" });
    expect(
      resolveRedisEnv({
        UPSTASH_REDIS_REST_URL: "",
        UPSTASH_REDIS_REST_TOKEN: "",
        KV_REST_API_URL: "ku",
        KV_REST_API_TOKEN: "kt",
      }),
    ).toMatchObject({ status: "found", url: "ku" });
    expect(
      resolveRedisEnv({ MYAPP_KV_REST_API_URL: "", MYAPP_KV_REST_API_TOKEN: "t" }),
    ).toEqual({ status: "none" });
  });

  it("undefined values are absent", () => {
    expect(
      resolveRedisEnv({ UPSTASH_REDIS_REST_URL: undefined, UPSTASH_REDIS_REST_TOKEN: undefined }),
    ).toEqual({ status: "none" });
  });

  it("prefixed pair is found", () => {
    expect(
      resolveRedisEnv({ MYAPP_KV_REST_API_URL: "pu", MYAPP_KV_REST_API_TOKEN: "pt" }),
    ).toEqual({
      status: "found",
      url: "pu",
      token: "pt",
      urlName: "MYAPP_KV_REST_API_URL",
      tokenName: "MYAPP_KV_REST_API_TOKEN",
    });
  });

  it("prefixed URL with a token of another prefix gives none", () => {
    expect(
      resolveRedisEnv({ A_KV_REST_API_URL: "u", B_KV_REST_API_TOKEN: "t" }),
    ).toEqual({ status: "none" });
  });

  it("two full prefixed pairs are ambiguous", () => {
    expect(
      resolveRedisEnv({
        B_KV_REST_API_URL: "u2",
        B_KV_REST_API_TOKEN: "t2",
        A_KV_REST_API_URL: "u1",
        A_KV_REST_API_TOKEN: "t1",
      }),
    ).toEqual({ status: "ambiguous", urlNames: ["A_KV_REST_API_URL", "B_KV_REST_API_URL"] });
  });

  it("one full prefixed pair plus one incomplete is not ambiguous", () => {
    expect(
      resolveRedisEnv({
        A_KV_REST_API_URL: "u1",
        A_KV_REST_API_TOKEN: "t1",
        B_KV_REST_API_URL: "u2",
      }),
    ).toMatchObject({ status: "found", urlName: "A_KV_REST_API_URL" });
  });

  it("read-only token, REDIS_URL and KV_URL alone give none", () => {
    expect(resolveRedisEnv({ KV_REST_API_READ_ONLY_TOKEN: "t" })).toEqual({ status: "none" });
    expect(resolveRedisEnv({ KV_REST_API_URL: "u", KV_REST_API_READ_ONLY_TOKEN: "t" })).toEqual({
      status: "none",
    });
    expect(resolveRedisEnv({ REDIS_URL: "redis://x" })).toEqual({ status: "none" });
    expect(resolveRedisEnv({ KV_URL: "redis://x" })).toEqual({ status: "none" });
    expect(resolveRedisEnv({})).toEqual({ status: "none" });
  });
});

const ALL_NAMES = [
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "KV_REST_API_URL",
  "KV_REST_API_TOKEN",
];

function clearRedisEnv() {
  for (const name of [
    ...ALL_NAMES,
    ...Object.keys(process.env).filter((n) => /_KV_REST_API_(URL|TOKEN)$/.test(n)),
  ]) {
    vi.stubEnv(name, "");
  }
}

describe("getRepository / getBookingService", () => {
  let warn: ReturnType<typeof vi.spyOn>;
  let info: ReturnType<typeof vi.spyOn>;
  let error: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    delete (globalThis as Record<symbol, unknown>)[Symbol.for("room-booking.memory-repository")];
    vi.resetModules();
    redisCtor.mockClear();
    clearRedisEnv();
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    info = vi.spyOn(console, "info").mockImplementation(() => {});
    error = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  const load = () => import("./repository-factory");

  it("no env: memory and exactly one warning", async () => {
    const { getRepository } = await load();
    expect(getRepository().kind).toBe("memory");
    getRepository();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(redisCtor).not.toHaveBeenCalled();
  });

  it("Upstash pair: redis, logs names but never values", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://secret-host.example");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "super-secret-token");
    const { getRepository } = await load();
    expect(getRepository().kind).toBe("redis");
    expect(redisCtor).toHaveBeenCalledTimes(1);
    expect(redisCtor).toHaveBeenCalledWith({
      url: "https://secret-host.example",
      token: "super-secret-token",
      automaticDeserialization: false,
    });
    const logged = JSON.stringify([...info.mock.calls, ...warn.mock.calls, ...error.mock.calls]);
    expect(logged).toContain("UPSTASH_REDIS_REST_URL");
    expect(logged).toContain("UPSTASH_REDIS_REST_TOKEN");
    expect(logged).not.toContain("secret-host");
    expect(logged).not.toContain("super-secret-token");
    expect(warn).not.toHaveBeenCalled();
  });

  it("prefixed pair is used", async () => {
    vi.stubEnv("MYAPP_KV_REST_API_URL", "https://p.example");
    vi.stubEnv("MYAPP_KV_REST_API_TOKEN", "ptok");
    const { getRepository } = await load();
    expect(getRepository().kind).toBe("redis");
    expect(JSON.stringify(info.mock.calls)).toContain("MYAPP_KV_REST_API_URL");
  });

  it("ambiguous prefixed pairs: memory plus console.error naming variables only", async () => {
    vi.stubEnv("A_KV_REST_API_URL", "https://a.example");
    vi.stubEnv("A_KV_REST_API_TOKEN", "tok-a");
    vi.stubEnv("B_KV_REST_API_URL", "https://b.example");
    vi.stubEnv("B_KV_REST_API_TOKEN", "tok-b");
    const { getRepository } = await load();
    expect(getRepository().kind).toBe("memory");
    expect(error).toHaveBeenCalledTimes(1);
    const logged = JSON.stringify(error.mock.calls);
    expect(logged).toContain("A_KV_REST_API_URL");
    expect(logged).toContain("B_KV_REST_API_URL");
    expect(logged).not.toMatch(/a\.example|b\.example|tok-a|tok-b/);
    expect(redisCtor).not.toHaveBeenCalled();
  });

  it("is memoized", async () => {
    vi.stubEnv("KV_REST_API_URL", "https://k.example");
    vi.stubEnv("KV_REST_API_TOKEN", "ktok");
    const { getRepository, getBookingService } = await load();
    expect(getRepository()).toBe(getRepository());
    expect(getBookingService()).toBe(getBookingService());
    expect(redisCtor).toHaveBeenCalledTimes(1);
    expect(info).toHaveBeenCalledTimes(1);
  });
});
