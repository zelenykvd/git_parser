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
    app.listen(config.server.port, () => {
      console.log(`API server running on http://localhost:${config.server.port}`);
      resolve();
    });
  });
}
