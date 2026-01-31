import express from "express";
import dotenv from "dotenv";
import { healthCheck, query } from "./db.js";
import { nanoid } from "nanoid";

dotenv.config();
const app = express();
app.use(express.json());
app.use(express.static("public"));

const PORT = process.env.PORT || 3000;

//helper to get current time for TEST MODE
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

    // fallback: real time
    return new Date();
}

//route to check db contectivity
app.get("/api/healthz", async (req, res) => {
    const ok = await healthCheck();
    const statuscode = ok ? 200 : 500;
    return res.status(statuscode).json({ ok });
});
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//HTML escape helper
function escapeHtml(str) {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;"); //this code protescts afains user injecting scripts
}

app.get("/p/:id", async (req, res) => {
    const { id } = req.params;

    // fetch paste + check TTL + check view limits
    let pasteRow;

    try {
        const result = await query(
            `SELECT id, content, ttl_seconds, max_views, view_count, created_at
         FROM pastes
         WHERE id = $1`,
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

    //ttl
    let expiresAt = null;

    if (pasteRow.ttl_seconds != null) {
        const created = new Date(pasteRow.created_at);
        expiresAt = new Date(created.getTime() + pasteRow.ttl_seconds * 1000);

        if (Date.now() >= expiresAt.getTime()) {
            return renderNotFound(res);
        }
    }

    //view limit
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
//getting logic////////////////////////////////////////////////////////////////////////////////////////////////////
app.get("/api/pastes/:id", async (req, res) => {
    const paramid = req.params.id;
    let pasteRow;
    try {
        const result = await query(
            `SELECT id, content, ttl_seconds, max_views, view_count, created_at FROM pastes WHERE id = $1`,
            [paramid],
        );
        //if paste does not exist
        if (result.rows.length === 0) {
            return res.status(404).json({ error: "paste not found" });
        }
        //paste exists success
        //return res.status(200).json(result.rows);
        pasteRow = result.rows[0];
    } catch (err) {
        console.log("Error ", err);
        return res.status(500).json({ error: "server error" });
    }

    //checking if rows valid
    const now = getCurrentTime(req);

    let expiresAt = null;
    if (pasteRow.ttl_seconds != null) {
        // created_at is stored as timestamp — convert to Date
        const createdAtDate = new Date(pasteRow.created_at);
        expiresAt = new Date(
            createdAtDate.getTime() + pasteRow.ttl_seconds * 1000,
        );

        if (now >= expiresAt) {
            // TTL expired
            return res.status(404).json({ error: "Paste not found" });
        }
    }

    //checking with max views
    let remainingViews = null;

    try {
        if (pasteRow.max_views != null) {
            // Limited views case
            const updateResult = await query(
                `UPDATE pastes
                 SET view_count = view_count + 1
                 WHERE id = $1 AND view_count < max_views
                 RETURNING view_count, max_views`,
                [paramid],
            );

            if (updateResult.rowCount === 0) {
                // No row updated → view limit reached
                return res.status(404).json({ error: "Paste not found" });
            }

            const updated = updateResult.rows[0];
            remainingViews = Math.max(
                updated.max_views - updated.view_count,
                0,
            );
        } else {
            // Unlimited views  still increment view_count, but don’t track remaining
            await query(
                `UPDATE pastes
                 SET view_count = view_count + 1
                 WHERE id = $1`,
                [paramid],
            );
            remainingViews = null;
        }
    } catch (err) {
        console.error("Error updating view_count:", err);
        return res.status(500).json({ error: "Internal server error" });
    }

    //success return statement
    return res.status(200).json({
        content: pasteRow.content,
        remaining_views: remainingViews,
        expires_at: expiresAt ? expiresAt.toISOString() : null,
    });
});
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//pasting logic
app.post("/api/pastes", async (req, res) => {
    //Validating paste parameters
    const { content, ttl_seconds, max_views } = req.body;

    //validating content validity
    if (typeof content !== "string" || content.trim() === "") {
        return res.status(400).json({
            error: "content must be in a non empty string.",
        });
    }
    //validating ttl seconds (life of content)
    if (ttl_seconds !== undefined) {
        if (!Number.isInteger(ttl_seconds) || ttl_seconds < 1) {
            return res.status(400).json({
                error: "time limit must be greater than 1.",
            });
        }
    }

    //validating max views
    if (max_views !== undefined) {
        if (!Number.isInteger(max_views) || max_views < 1) {
            return res.status(400).json({
                error: "mex views must be greater than 1",
            });
        }
    }

    //generating random charecter string for id and api endpoint
    const id = nanoid(10);

    //inserting paste data into db
    try {
        await query(
            `INSERT INTO pastes (id, content, ttl_seconds, max_views)
   VALUES ($1, $2, $3, $4)`,
            [id, content, ttl_seconds ?? null, max_views ?? null],
        );
    } catch (err) {
        console.log("error inserting paste: ", err);
        return res.status(500).json({ error: "Internal server error" });
    }

    //helper to send legitimate URL
    const baseUrl =
        process.env.BASE_URL ||
        (process.env.VERCEL_URL
            ? `https://${process.env.VERCEL_URL}`
            : `http://localhost:${PORT}`);

    //returning url
    return res.status(201).json({
        id,
        url: `${baseUrl}/p/${id}`,
    });
});

///////////////////////////////////////////////////////////////////////////////////////////////////////
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
