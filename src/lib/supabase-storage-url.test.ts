import { describe, expect, it } from "vitest";
import { getBrowserSupabaseUrl, rewriteSupabaseStorageSignedUrl } from "./supabase-storage-url";

describe("Supabase Storage browser URLs", () => {
  it("maps Docker's host gateway to localhost for browser previews", () => {
    expect(getBrowserSupabaseUrl("http://host.docker.internal:54321")).toBe("http://localhost:54321");
  });

  it("prefers an explicitly configured public URL", () => {
    expect(getBrowserSupabaseUrl("http://host.docker.internal:54321", "http://supabase.local:54321/")).toBe(
      "http://supabase.local:54321",
    );
  });

  it("rewrites signed URL origin while preserving the signed path and query", () => {
    const rewritten = rewriteSupabaseStorageSignedUrl({
      serverUrl: "http://host.docker.internal:54321",
      signedUrl:
        "http://host.docker.internal:54321/storage/v1/object/sign/parking-entry-snapshots/a.jpg?token=abc",
    });

    expect(rewritten).toBe("http://localhost:54321/storage/v1/object/sign/parking-entry-snapshots/a.jpg?token=abc");
  });

  it("leaves unrelated signed URL origins unchanged", () => {
    const signedUrl = "https://project.supabase.co/storage/v1/object/sign/bucket/a.jpg?token=abc";
    expect(
      rewriteSupabaseStorageSignedUrl({
        serverUrl: "http://host.docker.internal:54321",
        signedUrl,
      }),
    ).toBe(signedUrl);
  });
});
