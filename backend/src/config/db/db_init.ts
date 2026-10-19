// pg.Pool setup. One database, one connection string — there is no dev/prod split.
import 'dotenv/config';
import pg from 'pg';

if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set — copy .env.example to .env');
    process.exit(1);
}

export const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
});

pool.on('error', (e) => console.error('idle pg client error', e));
