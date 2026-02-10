import { envFileExists, getMissingRequiredVars } from "./setup/env-writer.js";

function needsSetup(): boolean {
  if (!envFileExists()) {
    console.log("No .env file found — starting setup wizard.");
    return true;
  }

  const missing = getMissingRequiredVars();
  if (missing.length > 0) {
    console.log(`Missing required variables: ${missing.join(", ")} — starting setup wizard.`);
    return true;
  }

  return false;
}

async function startMainApp() {
  // Load .env into process.env
  await import("dotenv/config");
  const { main } = await import("./index.js");
  await main();
}

if (needsSetup()) {
  const { startSetupServer } = await import("./setup/server.js");
  await startSetupServer(async () => {
    await startMainApp();
  });
} else {
  await startMainApp();
}
