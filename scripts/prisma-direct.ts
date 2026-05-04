import { existsSync, readFileSync } from "fs";
import { spawn } from "child_process";
import { join } from "path";

function loadLocalEnv(env: NodeJS.ProcessEnv) {
  const envPath = join(process.cwd(), ".env");
  if (!existsSync(envPath)) return;

  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;

    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed
      .slice(eqIdx + 1)
      .trim()
      .replace(/^['"]|['"]$/g, "");

    if (!env[key]) env[key] = value;
  }
}

const env = { ...process.env };
loadLocalEnv(env);

if (!env.DIRECT_URL) {
  console.error("DIRECT_URL is required for direct Prisma schema commands.");
  process.exit(1);
}

try {
  const directUrl = new URL(env.DIRECT_URL);
  if (
    directUrl.hostname.includes("pooler.supabase.com") &&
    directUrl.port !== "5432"
  ) {
    console.error(
      [
        "DIRECT_URL is pointing at the Supabase transaction pooler.",
        "",
        "Use either the direct Supabase connection for DIRECT_URL:",
        "  postgresql://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres",
        "",
        "Or the Supabase session pooler on port 5432:",
        "  postgresql://postgres.<project-ref>:<password>@aws-...pooler.supabase.com:5432/postgres",
        "",
        "Use the pooler only for DATABASE_URL:",
        "  postgresql://postgres.<project-ref>:<password>@aws-...pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1",
      ].join("\n")
    );
    process.exit(1);
  }
} catch {
  console.error("DIRECT_URL is not a valid PostgreSQL URL.");
  process.exit(1);
}

env.DATABASE_URL = env.DIRECT_URL;

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("Usage: bun scripts/prisma-direct.ts <prisma args>");
  process.exit(1);
}

const child = spawn("bunx", ["prisma", ...args], {
  env,
  stdio: "inherit",
});

child.on("exit", (code) => {
  process.exit(code ?? 1);
});
