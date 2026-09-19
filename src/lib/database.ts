import { Pool, type PoolClient } from "pg";

let pool: Pool | undefined;

export function databaseConfigured() {
  return Boolean(process.env.DATABASE_URL);
}

export function database() {
  if (!process.env.DATABASE_URL) throw new Error("Database is not configured");
  pool ??= new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 2,
    idleTimeoutMillis: 10000,
    allowExitOnIdle: true,
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
