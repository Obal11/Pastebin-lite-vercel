import express from "express";
import dotenv from "dotenv";
import { healthCheck, query } from "./db.js";
import { nanoid } from "nanoid";

dotenv.config();
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

app.get("/api/healthz", async (req, res) => {
    const ok = await healthCheck();
    const statuscode = ok ? 200 : 500;
    res.status(statuscode).json(ok);
});

app.post("/api/pastes", async (req, res) => {
    //Validating paste parameters
    const { content, ttl_seconds, max_views } = req.body;

    //validating content validity
    if (typeof content !== "string" || content.trim() === "") {
        res.status(400).json({
            error: "content must be in a non empty string.",
        });
    }
    //validating ttl seconds (life of content)
    if (ttl_seconds !== undefined) {
        if (!Number.isInteger(ttl_seconds) || ttl_seconds < 1) {
            res.status(400).json({
                error: "time limit must be greater than 1.",
            });
        }
    }

    //validating max views
    if (max_views !== undefined) {
        if (!Number.isInteger(max_views) || max_views < 1) {
            res.status(400).json({
                error: "mex views must be greater than 1",
            });
        }
    }

    //generating random charecter string for id and api endpoint
    const id = nanoid(10);

    //inserting paste data into db
    await query(
        `INSERT INTO pastes (id, content, ttl_seconds, max_views)
   VALUES ($1, $2, $3, $4)`,
        [id, content, ttl_seconds ?? null, max_views ?? null],
    );

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

app.listen(PORT, () => {
    console.log(`listening on port ${PORT}`);
});
