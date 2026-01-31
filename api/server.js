import express from "express";
import dotenv from "dotenv";
import { healthCheck } from "./db.js";

dotenv.config();
const app = express();

const PORT = process.env.PORT || 3000;

app.get("/api/healthz", async (req, res) => {
    const ok = await healthCheck();
    const statuscode = ok ? 200 : 500;
    res.status(statuscode).json(ok);
});

app.listen(PORT, () => {
    console.log(`listening on port ${PORT}`);
});
