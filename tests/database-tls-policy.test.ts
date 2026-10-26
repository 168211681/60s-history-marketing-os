import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeSecureDatabaseUrl, remoteTlsOptions } from "../src/lib/database-tls-policy";

const remote = "postgresql://user:synthetic@aws-0-us-east-1.pooler.supabase.com:5432/postgres";

test("CF-SEC-01: remote PostgreSQL TLS must verify the server certificate", () => {
  assert.deepEqual(remoteTlsOptions(), { rejectUnauthorized: true });
});

test("CF-SEC-01: optional CA retains verification and handles escaped newlines", () => {
  const ca = "-----BEGIN CERTIFICATE-----\\nSYNTHETIC-TEST-CONTENT\\n-----END CERTIFICATE-----";
  assert.deepEqual(remoteTlsOptions(ca), {
    rejectUnauthorized: true,
    ca: "-----BEGIN CERTIFICATE-----\nSYNTHETIC-TEST-CONTENT\n-----END CERTIFICATE-----",
  });
});

test("CF-SEC-01: missing or invalid provider CA fails closed", () => {
  for (const value of ["", " ", "not-a-cert", "-----BEGIN CERTIFICATE-----"]) {
    assert.throws(() => remoteTlsOptions(value), /DATABASE_SSL_CA_PEM/);
  }
});

test("CF-SEC-01: libpq sslmode does not override the verified Pool TLS policy", () => {
  for (const mode of ["require", "verify-ca", "verify-full"]) {
    const url = new URL(normalizeSecureDatabaseUrl(`${remote}?sslmode=${mode}&uselibpqcompat=true`));
    assert.equal(url.searchParams.has("sslmode"), false);
    assert.equal(url.searchParams.has("uselibpqcompat"), false);
  }
});

test("CF-SEC-01: insecure SSL modes and URL-provided TLS materials fail closed", () => {
  for (const query of ["sslmode=disable", "sslmode=prefer", "sslmode=allow", "ssl=false", "sslrootcert=%2Ftmp%2Fca.pem", "sslcert=x", "sslkey=x"]) {
    assert.throws(() => normalizeSecureDatabaseUrl(`${remote}?${query}`));
  }
});

test("CF-SEC-01: invalid and non-Postgres URLs fail closed", () => {
  for (const value of ["not-a-url", "https://example.com/db", "postgresql:/missing-host", ""]) {
    assert.throws(() => normalizeSecureDatabaseUrl(value));
  }
});

test("CF-SEC-01: local PostgreSQL IPv4/IPv6 loopback remains compatible", () => {
  for (const host of ["localhost", "127.0.0.1", "[::1]"]) {
    const url = new URL(normalizeSecureDatabaseUrl(`postgresql://postgres@${host}:5432/postgres?sslmode=disable`));
    assert.equal(url.searchParams.has("sslmode"), false);
  }
});

test("CF-SEC-01: unrelated connection parameters are preserved", () => {
  const url = new URL(normalizeSecureDatabaseUrl(`${remote}?application_name=clipforge&connect_timeout=3`));
  assert.equal(url.searchParams.get("application_name"), "clipforge");
  assert.equal(url.searchParams.get("connect_timeout"), "3");
});
