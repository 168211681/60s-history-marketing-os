export function validateStagingDatabaseUrl(
  rawUrl,
  { stagingRef = "haqpqifxlqpihkmhkwdu", productionRef = "rscwajzsjvguezyisvja" } = {},
) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("STAGING_DATABASE_URL is not a valid PostgreSQL URL.");
  }

  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error("STAGING_DATABASE_URL must use PostgreSQL.");
  }
  if (url.port !== "5432") {
    throw new Error("Staging database connections must use port 5432.");
  }
  if (url.pathname !== "/postgres") {
    throw new Error("Staging database target must be the postgres database.");
  }
  if (url.hostname.includes(productionRef) || url.username.includes(productionRef)) {
    throw new Error("Production project reference found in staging database target.");
  }

  const directHost = `db.${stagingRef}.supabase.co`;
  if (url.hostname === directHost) {
    if (url.username !== "postgres") {
      throw new Error("Direct Staging connections must use the postgres username.");
    }
    return "direct";
  }

  if (/^[a-z0-9-]+\.pooler\.supabase\.com$/.test(url.hostname)) {
    if (url.username !== `postgres.${stagingRef}`) {
      throw new Error("Session Pooler connections must use the Staging project username.");
    }
    return "session-pooler";
  }

  throw new Error("Database host is neither the verified Staging host nor an official Session Pooler host.");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const rawUrl = process.argv[2];
  const stagingRef = process.argv[3] ?? "haqpqifxlqpihkmhkwdu";
  const productionRef = process.argv[4] ?? "rscwajzsjvguezyisvja";
  if (!rawUrl) throw new Error("Usage: assert-staging-database-url.mjs <database-url> [staging-ref] [production-ref]");
  console.log(`Staging database identity passed: ${validateStagingDatabaseUrl(rawUrl, { stagingRef, productionRef })}.`);
}
