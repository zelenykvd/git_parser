import { execFile, exec } from "child_process";
import { promisify } from "util";
import path from "path";

const execFileAsync = promisify(execFile);
const execAsync = promisify(exec);

const PROJECT_ROOT = path.resolve(import.meta.dirname, "../..");

export async function isDockerAvailable(): Promise<{ ok: boolean; error?: string }> {
  try {
    await execFileAsync("docker", ["info"], { timeout: 10_000 });
    return { ok: true };
  } catch (err: any) {
    if (err.code === "ENOENT") {
      return { ok: false, error: "Docker is not installed. Please install Docker Desktop." };
    }
    return { ok: false, error: "Docker daemon is not running. Please start Docker Desktop." };
  }
}

export async function isPostgresContainerRunning(): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync("docker", [
      "ps", "--filter", "name=telegram_parser_db", "--format", "{{.Status}}"
    ]);
    return stdout.trim().startsWith("Up");
  } catch {
    return false;
  }
}

export async function startPostgres(): Promise<void> {
  const running = await isPostgresContainerRunning();
  if (running) return;

  await execAsync("docker compose up -d", { cwd: PROJECT_ROOT, timeout: 60_000 });
}

export async function waitForPostgres(timeoutMs = 30_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await execFileAsync("docker", [
        "exec", "telegram_parser_db",
        "pg_isready", "-U", "parser"
      ], { timeout: 5_000 });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 1_000));
    }
  }
  throw new Error("PostgreSQL did not become ready within timeout");
}

export async function runMigrations(): Promise<string> {
  const { stdout, stderr } = await execAsync("npx prisma migrate deploy", {
    cwd: PROJECT_ROOT,
    timeout: 30_000,
    env: {
      ...process.env,
      DATABASE_URL: "postgresql://parser:password@localhost:5433/telegram_parser",
    },
  });
  return stdout + stderr;
}

export async function generatePrismaClient(): Promise<string> {
  const { stdout, stderr } = await execAsync("npx prisma generate", {
    cwd: PROJECT_ROOT,
    timeout: 30_000,
  });
  return stdout + stderr;
}
