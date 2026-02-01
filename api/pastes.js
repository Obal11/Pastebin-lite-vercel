import { query } from "../db.js";
import { nanoid } from "nanoid";

export default async function handler(req, res) {
    try {
        if (req.method !== "POST") {
            res.status(400).json({ error: "This method not allowed " });
        }
        const { content, ttl_seconds, max_views } = req.body;

        if (typeof content !== "string" || content.trim() === "") {
            return res.status(400).json({
                error: "content must be a non-empty string",
            });
        }

        if (ttl_seconds !== undefined) {
            if (!Number.isInteger(ttl_seconds) || ttl_seconds < 1) {
                return res.status(400).json({
                    error: "ttl_seconds must be an integer >= 1",
                });
            }
        }

        if (max_views !== undefined) {
            if (!Number.isInteger(max_views) || max_views < 1) {
                return res.status(400).json({
                    error: "max_views must be an integer >= 1",
                });
            }
        }

        const id = nanoid(10);

        try {
            await query(
                `INSERT INTO pastes (id, content, ttl_seconds, max_views)
             VALUES ($1, $2, $3, $4)`,
                [id, content, ttl_seconds ?? null, max_views ?? null],
            );
        } catch (err) {
            console.error("Error inserting paste:", err);
            return res.status(500).json({ error: "Internal server error" });
        }

        const baseUrl =
            process.env.BASE_URL ||
            (process.env.VERCEL_URL
                ? `https://${process.env.VERCEL_URL}`
                : `http://localhost:${PORT}`);

        return res.status(201).json({
            id,
            url: `${baseUrl}/p/${id}`,
        });
    } catch (err) {
        console.log("paste created error", err);
        res.status(500).json({ error: "Internal server error" });
    }
}
