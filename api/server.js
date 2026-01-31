import express from "express";

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/api/healthz", (req, res) => {
    res.status(200).json({ ok: true });
});

app.listen(PORT, () => {
    console.log(`listening on port ${PORT}`);
});
