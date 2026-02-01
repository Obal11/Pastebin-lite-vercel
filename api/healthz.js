import { healthCheck } from "../db.js";

export default async function handler(req, res) {
    try {
        const ok = await healthCheck();
        const statusCode = ok ? 200 : 500;
        res.status(statusCode).json({ ok });
    } catch (err) {
        res.status(500).json({ ok: false, error: "Health check failed" });
    }
}
