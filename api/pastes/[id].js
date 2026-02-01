// api/pastes/[id].js

export default function handler(req, res) {
    if (req.method !== "GET") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    const { id } = req.query || {};

    return res.status(200).json({
        message: "Dynamic route working",
        id,
    });
}
