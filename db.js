import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
    console.warn("Warning: DATABASE_URL is not set in .env");
}

export const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

// helper func to run queries
export async function query(text, params) {
    const client = await pool.connect();
    try {
        const res = await client.query(text, params);
        return res;
    } finally {
        client.release();
    }
}

// health check: can we talk to DB?
export async function healthCheck() {
    try {
        await query("SELECT 1");
        return true;
    } catch (err) {
        console.error("DB health check failed:", err);
        return false;
    }
}
