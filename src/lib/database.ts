import { Pool, type PoolClient } from "pg";
import { normalizeSecureDatabaseUrl, remoteTlsOptions } from "./database-tls-policy";

let pool: Pool | undefined;

function connectionString() {
  const value = process.env.DATABASE_URL;
  if (!value) throw new Error("Database is not configured");
  return normalizeSecureDatabaseUrl(value);
}

function localDatabase(value: string | undefined) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
  } catch {
    return false;
  }
}

export function databaseConfigured() {
  return Boolean(process.env.DATABASE_URL);
}

export function database() {
  if (!process.env.DATABASE_URL) throw new Error("Database is not configured");
  pool ??= new Pool({
    connectionString: connectionString(),
    max: 2,
    idleTimeoutMillis: 10000,
    allowExitOnIdle: true,
    // Always verify the remote server identity; an optional provider CA can be configured.
    ssl: localDatabase(process.env.DATABASE_URL) ? false : remoteTlsOptions(process.env.DATABASE_SSL_CA_PEM),
  });
  return pool;
}

export async function transaction<T>(work: (client: PoolClient) => Promise<T>) {
  const client = await database().connect();
  try {
    await client.query("begin");
    const result = await work(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
