import type { Payload } from 'payload'

let schemaReady: Promise<void> | null = null

/**
 * Creates the search_index table + indexes if they don't exist. Idempotent.
 * Called lazily on first write so a fresh project gets the schema as soon
 * as any content is saved — no migration file needed.
 */
export function ensureSearchSchema(payload: Payload): Promise<void> {
  if (schemaReady) return schemaReady

  schemaReady = (async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pool = (payload.db as any)?.pool
    if (!pool || typeof pool.query !== 'function') {
      throw new Error(
        '[search] payload.db.pool is not available — the postgres adapter is required.',
      )
    }

    // Isolate the search table in its own Postgres schema so Payload's
    // Drizzle push (which only manages `public`) never tries to drop it.
    await pool.query(`CREATE SCHEMA IF NOT EXISTS search`)
    await pool.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`)

    await pool.query(`
      CREATE TABLE IF NOT EXISTS search.search_index (
        id          BIGSERIAL PRIMARY KEY,
        collection  TEXT NOT NULL,
        doc_id      TEXT NOT NULL,
        locale      TEXT NOT NULL,
        title       TEXT,
        url         TEXT,
        raw_text    TEXT NOT NULL,
        tsv         TSVECTOR NOT NULL,
        updated_at  TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (collection, doc_id, locale)
      )
    `)

    await pool.query(
      `CREATE INDEX IF NOT EXISTS search_index_tsv_idx ON search.search_index USING GIN (tsv)`,
    )
    await pool.query(
      `CREATE INDEX IF NOT EXISTS search_index_trgm_idx ON search.search_index USING GIN (raw_text gin_trgm_ops)`,
    )
    await pool.query(
      `CREATE INDEX IF NOT EXISTS search_index_lookup_idx ON search.search_index (collection, doc_id)`,
    )
  })().catch((err) => {
    schemaReady = null
    throw err
  })

  return schemaReady
}

export function resetSchemaCache(): void {
  schemaReady = null
}
