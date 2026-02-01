// api/pasteById.js
import { query } from "../db.js";

// Get "now" depending on TEST_MODE and header
function getNowFromRequest(req) {
    const testMode = process.env.TEST_MODE;
    if (testMode === "1") {
        const headerValue = req.headers["x-test-now-ms"];
        if (headerValue !== undefined) {
            const ms = Number(headerValue);
            if (!Number.isNaN(ms)) {
                return new Date(ms);
            }
        }
    }
    return new Date();
}

// Safely extract the ID from the original URL path
function getIdFromReq(req) {
    // req.url might look like: /api/pastes/0aZM49lzKR or /api/pastes/0aZM49lzKR?foo=bar
    const [path] = req.url.split("?");
    const parts = path.split("/");
    const last = parts[parts.length - 1];
    return last || null;
}

export default async function handler(req, res) {
    try {
        if (req.method !== "GET") {
            return res.status(405).json({ error: "Method not allowed" });
        }

        const id = getIdFromReq(req);

        if (!id) {
            return res.status(400).json({ error: "id is required" });
        }

        const { rows } = await query(
            `
            SELECT id, content, ttl_seconds, max_views, views_used, created_at
            FROM pastes
            WHERE id = $1
            `,
            [id],
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: "Paste not found" });
        }

        const paste = rows[0];
        const now = getNowFromRequest(req);
        const nowMs = now.getTime();

        // TTL logic
        let expiresAt = null;
        if (paste.ttl_seconds !== null && paste.ttl_seconds !== undefined) {
            const createdMs = paste.created_at.getTime();
            const expiryMs = createdMs + paste.ttl_seconds * 1000;
            expiresAt = new Date(expiryMs);

            if (expiryMs <= nowMs) {
                return res.status(404).json({ error: "Paste expired" });
            }
        }

        // View limit logic
        if (
            paste.max_views !== null &&
            paste.max_views !== undefined &&
            paste.views_used >= paste.max_views
        ) {
            return res.status(404).json({ error: "View limit exceeded" });
        }

        // Count this as a view
        await query(
            `
            UPDATE pastes
            SET views_used = views_used + 1
            WHERE id = $1
            `,
            [id],
        );

        // remaining_views AFTER this fetch
        let remainingViews = null;
        if (paste.max_views === null || paste.max_views === undefined) {
            remainingViews = null;
        } else {
            const usedAfterThis = paste.views_used + 1;
            const remaining = paste.max_views - usedAfterThis;
            remainingViews = remaining > 0 ? remaining : 0;
        }

        return res.status(200).json({
            content: paste.content,
            remaining_views: remainingViews,
            expires_at: expiresAt ? expiresAt.toISOString() : null,
        });
    } catch (err) {
        console.error("Error in pasteById:", err);
        return res.status(500).json({ error: "Internal server error" });
    }
}
