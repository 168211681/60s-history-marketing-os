/** CF-SEC-01: Centralized, fail-closed PostgreSQL TLS policy. */
const supportedSchemes = new Set(["postgres:", "postgresql:"]);
const conflictingSslParams = ["ssl", "sslcert", "sslkey", "sslrootcert"] as const;

export function normalizeSecureDatabaseUrl(rawUrl: string): string {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL URL");
  }
  if (!supportedSchemes.has(url.protocol) || !url.hostname) {
    throw new Error("DATABASE_URL must be a PostgreSQL URL with a host");
  }
  if (conflictingSslParams.some((name) => url.searchParams.has(name))) {
    throw new Error("Configure PostgreSQL CA via DATABASE_SSL_CA_PEM, not URL SSL parameters");
  }
  const hostname = url.hostname.toLowerCase();
  const isLoopback = ["localhost", "127.0.0.1", "[::1]"].includes(hostname);
  const mode = url.searchParams.get("sslmode");
  const allowed = isLoopback ? ["disable", "require", "verify-ca", "verify-full"] : ["require", "verify-ca", "verify-full"];
  if (mode && !allowed.includes(mode)) throw new Error("DATABASE_URL requests a disallowed SSL mode");
  // node-postgres can override the Pool ssl option when URL SSL options are present.
  url.searchParams.delete("sslmode");
  url.searchParams.delete("uselibpqcompat");
  return url.toString();
}

export function remoteTlsOptions(caPem?: string): { rejectUnauthorized: true; ca?: string } {
  if (caPem === undefined) return { rejectUnauthorized: true };
  const ca = caPem.replace(/\\n/g, "\n").trim();
  if (!ca.startsWith("-----BEGIN CERTIFICATE-----") || !ca.includes("-----END CERTIFICATE-----")) {
    throw new Error("DATABASE_SSL_CA_PEM must contain a PEM root certificate");
  }
  return { rejectUnauthorized: true, ca };
}
