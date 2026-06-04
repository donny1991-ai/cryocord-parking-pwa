export function getConfiguredTestDatabaseUrl() {
  return process.env.TEST_DATABASE_URL ?? process.env.SUPABASE_TEST_DB_URL;
}

export function assertSafeTestDatabaseUrl(url: string | undefined) {
  if (!url) {
    throw new Error("TEST_DATABASE_URL or SUPABASE_TEST_DB_URL must be set in .env.test for integration tests.");
  }

  const parsed = new URL(url);
  const haystack = `${parsed.hostname}${parsed.pathname}${parsed.search}`.toLowerCase();
  const isLocal =
    parsed.hostname === "localhost" ||
    parsed.hostname === "127.0.0.1" ||
    parsed.hostname === "::1" ||
    parsed.hostname === "db";
  const looksLikeTest = haystack.includes("test");
  const explicitlyConfirmed = process.env.CONFIRM_TEST_DATABASE_IS_ISOLATED === "true";

  if (!isLocal && !looksLikeTest && !explicitlyConfirmed) {
    throw new Error(
      "Refusing to run integration tests against a database URL that does not look isolated. " +
        "Use a local/test database URL or set CONFIRM_TEST_DATABASE_IS_ISOLATED=true in .env.test.",
    );
  }
}
