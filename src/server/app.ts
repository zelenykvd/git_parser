import express from "express";
import cors from "cors";
import { router } from "./routes.js";
import { config } from "../config.js";

const app = express();

app.use(cors());
app.use(express.json());
app.use(router);

export function startServer() {
  return new Promise<void>((resolve) => {
    app.listen(config.server.port, "0.0.0.0", () => {
      console.log(`API server running on http://0.0.0.0:${config.server.port}`);
      resolve();
    });
  });
}
