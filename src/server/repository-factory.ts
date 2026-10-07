import { Redis } from "@upstash/redis";
import { createBookingService } from "./booking-service";
import type { BookingService } from "./booking-service";
import { getMemoryRepository } from "./memory-repository";
import { RedisBookingRepository } from "./redis-repository";
import type { BookingRepository } from "./repository";

/**
 * Env pairs "REST URL + token" in priority order. A pair is taken whole, never
 * mixed. `exact` pairs are plain names; `suffix` finds `<PREFIX>_...` names
 * (the same prefix for both). Read-only tokens, REDIS_URL and KV_URL are
 * deliberately not listed.
 */
export const REDIS_ENV_PAIRS = [
  {
    kind: "exact",
    url: "UPSTASH_REDIS_REST_URL",
    token: "UPSTASH_REDIS_REST_TOKEN",
  },
  { kind: "exact", url: "KV_REST_API_URL", token: "KV_REST_API_TOKEN" },
  { kind: "suffix", url: "_KV_REST_API_URL", token: "_KV_REST_API_TOKEN" },
] as const;

export type EnvLike = Record<string, string | undefined>;

export type RedisEnvResolution =
  | {
      status: "found";
      url: string;
      token: string;
      urlName: string;
      tokenName: string;
    }
  | { status: "ambiguous"; urlNames: string[] }
  | { status: "none" };

/** Pure: picks the Redis credentials pair from an env object. */
export function resolveRedisEnv(env: EnvLike): RedisEnvResolution {
  for (const pair of REDIS_ENV_PAIRS) {
    if (pair.kind === "exact") {
      const url = env[pair.url];
      const token = env[pair.token];
      if (url && token) {
        return {
          status: "found",
          url,
          token,
          urlName: pair.url,
          tokenName: pair.token,
        };
      }
      continue;
    }
    const matches = Object.keys(env)
      .filter((name) => name.length > pair.url.length && name.endsWith(pair.url))
      .map((urlName) => ({
        urlName,
        tokenName: urlName.slice(0, -pair.url.length) + pair.token,
      }))
      .filter((m) => env[m.urlName] && env[m.tokenName]);
    if (matches.length > 1) {
      return { status: "ambiguous", urlNames: matches.map((m) => m.urlName).sort() };
    }
    if (matches.length === 1) {
      const { urlName, tokenName } = matches[0];
      return {
        status: "found",
        url: env[urlName] as string,
        token: env[tokenName] as string,
        urlName,
        tokenName,
      };
    }
  }
  return { status: "none" };
}

let repository: BookingRepository | undefined;
let service: BookingService | undefined;

/** Memoized repository: Redis when env credentials exist, otherwise in-memory. */
export function getRepository(): BookingRepository {
  if (repository) return repository;
  const resolved = resolveRedisEnv(process.env);
  if (resolved.status === "found") {
    console.info(
      `[storage] redis via ${resolved.urlName} + ${resolved.tokenName}`,
    );
    repository = new RedisBookingRepository(
      new Redis({
        url: resolved.url,
        token: resolved.token,
        automaticDeserialization: false,
      }),
    );
  } else {
    if (resolved.status === "ambiguous") {
      console.error(
        `[storage] several prefixed Redis variable pairs found (${resolved.urlNames.join(", ")}); falling back to in-memory`,
      );
    } else {
      console.warn("[storage] no Redis env found; using in-memory storage");
    }
    repository = getMemoryRepository();
  }
  return repository;
}

export function getBookingService(): BookingService {
  service ??= createBookingService(getRepository());
  return service;
}
