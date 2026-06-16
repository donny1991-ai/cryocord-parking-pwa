import "server-only";

import { createClient } from "redis";

interface MemoryEntry {
  expiresAt: number;
  value: string;
}

const memoryCache = new Map<string, MemoryEntry>();

let redisClientPromise: Promise<ReturnType<typeof createClient>> | null = null;
let redisUnavailableUntil = 0;
let loggedRedisError = false;

function cacheEnabled() {
  return process.env.NODE_ENV === "production" && process.env.CACHE_DISABLED !== "true";
}

function redisUrl() {
  const value = process.env.CACHE_REDIS_URL?.trim() || "";
  if (!value) return "";
  if (/^rediss?:\/\//i.test(value)) return value;

  const [hostPort, ...parts] = value.split(",").map((part) => part.trim()).filter(Boolean);
  const options = new Map(
    parts.map((part) => {
      const separator = part.indexOf("=");
      return separator === -1
        ? [part.toLowerCase(), ""]
        : [part.slice(0, separator).trim().toLowerCase(), part.slice(separator + 1).trim()];
    }),
  );
  const password = options.get("password");
  if (!hostPort || !password) return "";

  const protocol = options.get("ssl")?.toLowerCase() === "false" ? "redis" : "rediss";
  return `${protocol}://:${encodeURIComponent(password)}@${hostPort}`;
}

function keyPrefix() {
  return process.env.CACHE_REDIS_KEY_PREFIX ?? "cryocord-parking:";
}

function fullKey(key: string) {
  return `${keyPrefix()}${key}`;
}

function logRedisError(error: unknown) {
  if (loggedRedisError) return;
  loggedRedisError = true;
  const message = error instanceof Error ? error.message : String(error);
  console.warn("[cache] Redis unavailable; using in-memory fallback", { message });
}

async function getRedisClient() {
  const url = redisUrl();
  if (!url || Date.now() < redisUnavailableUntil) return null;

  redisClientPromise ??= (async () => {
    const client = createClient({ url });
    client.on("error", (error) => {
      redisUnavailableUntil = Date.now() + 30_000;
      logRedisError(error);
    });
    await client.connect();
    return client;
  })();

  try {
    return await redisClientPromise;
  } catch (error) {
    redisClientPromise = null;
    redisUnavailableUntil = Date.now() + 30_000;
    logRedisError(error);
    return null;
  }
}

function getMemoryValue(key: string) {
  const entry = memoryCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    memoryCache.delete(key);
    return null;
  }
  return entry.value;
}

function setMemoryValue(key: string, value: string, ttlSeconds: number) {
  memoryCache.set(key, {
    value,
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
}

export async function cacheJson<T>(key: string, ttlSeconds: number, load: () => Promise<T>): Promise<T> {
  if (!cacheEnabled() || ttlSeconds <= 0) {
    return load();
  }

  const namespacedKey = fullKey(key);
  const memoryValue = getMemoryValue(namespacedKey);
  if (memoryValue) return JSON.parse(memoryValue) as T;

  const redis = await getRedisClient();
  if (redis) {
    try {
      const value = await redis.get(namespacedKey);
      if (value) {
        setMemoryValue(namespacedKey, value, ttlSeconds);
        return JSON.parse(value) as T;
      }
    } catch (error) {
      redisUnavailableUntil = Date.now() + 30_000;
      logRedisError(error);
    }
  }

  const loaded = await load();
  const serialised = JSON.stringify(loaded);
  setMemoryValue(namespacedKey, serialised, ttlSeconds);

  if (redis) {
    try {
      await redis.set(namespacedKey, serialised, { EX: ttlSeconds });
    } catch (error) {
      redisUnavailableUntil = Date.now() + 30_000;
      logRedisError(error);
    }
  }

  return loaded;
}

export async function deleteCacheKeys(keys: string[]) {
  if (!cacheEnabled() || keys.length === 0) return;

  const namespacedKeys = keys.map(fullKey);
  for (const key of namespacedKeys) {
    memoryCache.delete(key);
  }

  const redis = await getRedisClient();
  if (!redis) return;

  try {
    await redis.del(namespacedKeys);
  } catch (error) {
    redisUnavailableUntil = Date.now() + 30_000;
    logRedisError(error);
  }
}
