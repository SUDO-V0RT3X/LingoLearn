// Minimal migration runner: applies migrations/*.sql in filename order, once each.
// Import the synchronous filesystem helpers used to list and read migration files.
// `readdirSync` → returns directory entries as an array.
// `readFileSync` → returns a file's contents as a string.
import { readdirSync, readFileSync } from 'node:fs';
// Import path helpers so migration paths are constructed portably across platforms.
// `join`    → safely concatenates path segments with the platform separator.
// `resolve` → turns a relative path into an absolute one against the CWD.
import { join, resolve } from 'node:path';
// Import the shared PostgreSQL pool so migrations run against the same connection config as the app.
import { pool } from '../src/config/db/db_init.js';

// Resolve the migrations directory relative to the process working directory.
// Using `resolve` guarantees an absolute path regardless of where the script is invoked from.
const dir = resolve(process.cwd(), 'migrations');

/**
 * Applies every SQL migration in filename order and records each successful file
 * in schema_migrations. Each migration runs in its own transaction so a failed
 * file is rolled back cleanly and can be retried after the SQL is fixed.
 */
// Async entry point that performs the whole migration pass.
async function main() {
    // Ensure the ledger table exists before we try to read from or write to it.
    // `IF NOT EXISTS` makes the bootstrap idempotent on a fresh or already-migrated database.
        // The migration's filename is the natural primary key for the ledger.
    await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
        filename TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
    // Load the set of already-applied filenames so we can skip them without re-reading.
    const applied = new Set(
        // Fetch every recorded filename from the ledger table.
        (await pool.query('SELECT filename FROM schema_migrations')).rows.map(r => r.filename));
    // Read the migrations directory, keep only `.sql` files, and sort lexicographically.
    // Lexicographic sort is what makes numeric prefixes (001_, 002_, …) run in order.
    const files = readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
    // Iterate the ordered file list and apply each one that has not been recorded yet.
    for (const file of files) {
        // Skip migrations that were already applied in a previous run.
        if (applied.has(file)) continue;
        // Read the migration's SQL source as UTF-8 text.
        const sql = readFileSync(join(dir, file), 'utf8');
        // Borrow a dedicated client from the pool so the whole file can run on one connection.
        // Using a single client is required for BEGIN/COMMIT to wrap the same session.
        const client = await pool.connect();
        // Wrap the actual work in try/catch/finally so the client is always released.
        try {
            // Open an explicit transaction so a failing migration rolls back atomically.
            await client.query('BEGIN');
            // Execute the entire file's SQL in one call; node-postgres supports multi-statement strings.
            await client.query(sql);
            // Record the migration as applied only after the SQL has succeeded.
            await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
            // Commit the transaction, making both the schema changes and the ledger row permanent.
            await client.query('COMMIT');
            // Announce success so operators can see progress in the console.
            console.log(`applied ${file}`);
        } catch (e) {
            // Undo any partial changes made by the failing migration.
            await client.query('ROLLBACK');
            // Print the failure with the offending filename for debugging.
            console.error(`FAILED ${file}:`, e);
            // Abort the process with a non-zero code so CI and orchestration treat it as a failure.
            process.exit(1);
        } finally {
            // Always return the client to the pool, even on failure.
            client.release();
        }
    }
    // Close the pool so the Node process can exit naturally once migrations finish.
    await pool.end();
    // Final success banner for the common case where nothing was left to apply.
    console.log('migrations up to date');
}
// Kick off the async entry point; any unhandled rejection will surface as a non-zero exit.
main();