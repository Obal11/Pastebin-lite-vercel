// app.js
import express from "express";
import dotenv from "dotenv";
import { healthCheck, query } from "./db.js";
import { nanoid } from "nanoid";

dotenv.config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// helper: escape HTML
function escapeHtml(str) {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function renderNotFound(res) {
    return res.status(404).send(`
<!DOCTYPE html>
<html>
  <head>
    <title>Paste Not Found</title>
    <style>
      body { font-family: sans-serif; max-width: 600px; margin: 40px auto; }
    </style>
  </head>
  <body>
    <h1>404 - Paste Not Found</h1>
    <p>This paste is expired, exceeded its views, or does not exist.</p>
  </body>
</html>
`);
}

// TEST_MODE-aware clock
function getCurrentTime(req) {
    const testMode = process.env.TEST_MODE === "1";

    if (testMode) {
        const headerValue = req.header("x-test-now-ms");
        if (headerValue) {
            const ms = Number(headerValue);
            if (!Number.isNaN(ms)) {
                return new Date(ms);
            }
        }
    }

    return new Date();
}

// ---------- ROUTES ----------

// /api/healthz
app.get("/api/healthz", async (req, res) => {
    const ok = await healthCheck();
    const statusCode = ok ? 200 : 500;
    res.status(statusCode).json({ ok });
});

// POST /api/pastes
app.post("/api/pastes", async (req, res) => {
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
});

// GET /api/pastes/:id
app.get("/api/pastes/:id", async (req, res) => {
    const { id } = req.params;

    let pasteRow;
    try {
        const result = await query(
            `SELECT id, content, ttl_seconds, max_views, view_count, created_at
             FROM pastes
             WHERE id = $1`,
            [id],
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ error: "Paste not found" });
        }

        pasteRow = result.rows[0];
    } catch (err) {
        console.error("Error fetching paste:", err);
        return res.status(500).json({ error: "Internal server error" });
    }

    const now = getCurrentTime(req);
    let expiresAt = null;

    if (pasteRow.ttl_seconds != null) {
        const createdAtDate = new Date(pasteRow.created_at);
        expiresAt = new Date(
            createdAtDate.getTime() + pasteRow.ttl_seconds * 1000,
        );

        if (now >= expiresAt) {
            return res.status(404).json({ error: "Paste not found" });
        }
    }

    let remainingViews = null;

    try {
        if (pasteRow.max_views != null) {
            const updateResult = await query(
                `UPDATE pastes
                 SET view_count = view_count + 1
                 WHERE id = $1 AND view_count < max_views
                 RETURNING view_count, max_views`,
                [id],
            );

            if (updateResult.rowCount === 0) {
                return res.status(404).json({ error: "Paste not found" });
            }

            const updated = updateResult.rows[0];
            remainingViews = Math.max(
                updated.max_views - updated.view_count,
                0,
            );
        } else {
            await query(
                `UPDATE pastes
                 SET view_count = view_count + 1
                 WHERE id = $1`,
                [id],
            );
            remainingViews = null;
        }
    } catch (err) {
        console.error("Error updating view_count:", err);
        return res.status(500).json({ error: "Internal server error" });
    }

    return res.status(200).json({
        content: pasteRow.content,
        remaining_views: remainingViews,
        expires_at: expiresAt ? expiresAt.toISOString() : null,
    });
});

// GET /p/:id (HTML view)
app.get("/p/:id", async (req, res) => {
    const { id } = req.params;

    let pasteRow;

    try {
        const result = await query(
            `SELECT id, content, ttl_seconds, max_views, view_count, created_at
             FROM pastes WHERE id = $1`,
            [id],
        );

        if (result.rowCount === 0) {
            return renderNotFound(res);
        }

        pasteRow = result.rows[0];
    } catch (err) {
        console.error("HTML fetch error:", err);
        return renderNotFound(res);
    }

    let expiresAt = null;
    if (pasteRow.ttl_seconds != null) {
        const created = new Date(pasteRow.created_at);
        expiresAt = new Date(created.getTime() + pasteRow.ttl_seconds * 1000);

        if (Date.now() >= expiresAt.getTime()) {
            return renderNotFound(res);
        }
    }

    if (
        pasteRow.max_views != null &&
        pasteRow.view_count >= pasteRow.max_views
    ) {
        return renderNotFound(res);
    }

    const safeContent = escapeHtml(pasteRow.content);

    return res.send(`
<!DOCTYPE html>
<html>
  <head>
    <title>Paste ${id}</title>
    <style>
      body {
        font-family: sans-serif;
        max-width: 600px;
        margin: 40px auto;
        line-height: 1.5;
      }
      pre {
        white-space: pre-wrap;
        word-break: break-word;
        padding: 1rem;
        border: 1px solid #ccc;
        border-radius: 6px;
        background: #f7f7f7;
      }
    </style>
  </head>
  <body>
    <h1>Paste</h1>
    <pre>${safeContent}</pre>
  </body>
</html>
`);
});

// static UI (if you added public/index.html)
app.use(express.static("public"));

export default app;
