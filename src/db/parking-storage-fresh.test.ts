import { afterEach, describe, expect, it, vi } from "vitest";
import { freshParkingStorageObjects, removeParkingStorageObjects } from "./parking-storage-fresh";

const createClient = vi.hoisted(() => vi.fn());

vi.mock("@supabase/supabase-js", () => ({
  createClient,
}));

function createStorageClient() {
  const lists = new Map<string, Array<{ name: string; id?: string | null; metadata?: unknown }>>([
    [
      "visitors/",
      [
        { name: "visitor-a", id: null, metadata: null },
        { name: "visitor-b", id: null, metadata: null },
      ],
    ],
    ["visitors/visitor-a/", [{ name: "entry", id: null, metadata: null }]],
    ["visitors/visitor-a/entry/", [{ name: "first.jpg", id: "object-a", metadata: { size: 123 } }]],
    ["visitors/visitor-b/", [{ name: "entry", id: null, metadata: null }]],
    ["visitors/visitor-b/entry/", [{ name: "second.png", id: "object-b", metadata: { size: 456 } }]],
  ]);
  const bucketApi = {
    list: vi.fn(async (path: string) => ({ data: lists.get(path) ?? [], error: null })),
    remove: vi.fn(async () => ({ error: null })),
  };

  return {
    bucketApi,
    client: {
      storage: {
        getBucket: vi.fn(async () => ({ data: { id: "parking-entry-snapshots" }, error: null })),
        from: vi.fn(() => bucketApi),
      },
    },
  };
}

describe("parking storage fresh cleanup", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    createClient.mockReset();
  });

  it("removes only objects under the parking visitor snapshot prefix", async () => {
    const { client, bucketApi } = createStorageClient();

    const removed = await removeParkingStorageObjects(client, "parking-entry-snapshots");

    expect(removed).toBe(2);
    expect(bucketApi.list.mock.calls.map(([path]) => path)).toEqual([
      "visitors/",
      "visitors/visitor-a/",
      "visitors/visitor-a/entry/",
      "visitors/visitor-b/",
      "visitors/visitor-b/entry/",
    ]);
    expect(bucketApi.remove).toHaveBeenCalledWith([
      "visitors/visitor-a/entry/first.jpg",
      "visitors/visitor-b/entry/second.png",
    ]);
  });

  it("skips cleanup when Supabase Storage is not configured", async () => {
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    vi.stubEnv("SUPABASE_STORAGE_SERVICE_ROLE_KEY", "");
    vi.stubEnv("SUPABASE_SERVICE_KEY", "");

    await expect(freshParkingStorageObjects()).resolves.toMatchObject({
      bucket: null,
      skipped: true,
      objectsRemoved: 0,
    });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("skips cleanup when the parking snapshot bucket does not exist", async () => {
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key");
    vi.stubEnv("PARKING_ENTRY_SNAPSHOT_BUCKET", "parking-entry-snapshots");
    createClient.mockReturnValue({
      storage: {
        getBucket: vi.fn(async () => ({ data: null, error: { statusCode: 404, message: "Not found" } })),
        from: vi.fn(),
      },
    });

    await expect(freshParkingStorageObjects()).resolves.toMatchObject({
      bucket: "parking-entry-snapshots",
      skipped: true,
      objectsRemoved: 0,
    });
  });
});
