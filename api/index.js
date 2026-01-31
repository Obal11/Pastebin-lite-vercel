import serverlessHttp from "serverless-http";
import app from "../app.js";

const handler = serverlessHttp(app);

export default function (req, res) {
    return handler(req, res);
}
