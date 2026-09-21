import { Pool, type PoolClient } from "pg";

let pool: Pool | undefined;

function connectionString() {
  const value = process.env.DATABASE_URL;
  if (!value) throw new Error("Database is not configured");
  try {
    const url = new URL(value);
    // pg's connection-string parser turns sslmode=require into full
    // certificate verification and overrides the ssl option below. The
    // Supabase shared pooler is already TLS-only, so let pg negotiate TLS
    // while accepting the provider's runtime certificate chain.
    url.searchParams.delete("sslmode");
    url.searchParams.delete("uselibpqcompat");
    return url.toString();
  } catch {
    return value;
  }
}

function localDatabase(value: string | undefined) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "::1";
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
    // Supabase's shared pooler presents a chain that Node's bundled CA
    // store may not trust in serverless runtimes. Keep TLS encryption while
    // allowing the provider endpoint to complete its certificate handshake.
    ssl: localDatabase(process.env.DATABASE_URL) ? false : { rejectUnauthorized: false },
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
