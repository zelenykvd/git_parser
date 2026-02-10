import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { router } from "./routes.js";
import { config } from "../config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ADMIN_DIST = path.resolve(__dirname, "../../admin/dist");

const app = express();

app.use(cors());
app.use(express.json());
app.use(router);

// Serve built admin frontend
if (fs.existsSync(ADMIN_DIST)) {
  app.use(express.static(ADMIN_DIST));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(ADMIN_DIST, "index.html"));
  });
}

export function startServer() {
  return new Promise<void>((resolve) => {
    app.listen(config.server.port, "0.0.0.0", () => {
      console.log(`API server running on http://0.0.0.0:${config.server.port}`);
      resolve();
    });
  });
}
