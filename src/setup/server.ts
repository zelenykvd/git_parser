import express from "express";
import { createSetupRouter } from "./routes.js";
import { getWizardHtml } from "./html.js";
import type { Server } from "http";

export async function startSetupServer(onComplete: () => void): Promise<void> {
  const app = express();
  app.use(express.json());

  // Serve wizard HTML for any non-API route
  const html = getWizardHtml();

  // Setup API routes
  const setupRouter = createSetupRouter(() => {
    console.log("Setup complete. Shutting down wizard server...");
    server.close(() => {
      console.log("Wizard server closed. Starting main application...");
      onComplete();
    });
  });

  app.use(setupRouter);

  // Health check (returns 503 during setup so frontend can distinguish)
  app.get("/api/health", (_req, res) => {
    res.status(503).json({ status: "setup" });
  });

  // Serve wizard HTML for all other routes
  app.get("*", (_req, res) => {
    res.type("html").send(html);
  });

  const port = Number(process.env.PORT || 3001);

  const server: Server = await new Promise((resolve) => {
    const s = app.listen(port, "0.0.0.0", () => {
      console.log(`\n  Setup wizard running at http://0.0.0.0:${port}\n`);
      resolve(s);
    });
  });
}
