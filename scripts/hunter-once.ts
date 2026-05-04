import { existsSync, readFileSync } from "fs";
import { join } from "path";

function loadLocalEnv() {
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

    if (!process.env[key]) process.env[key] = value;
  }
}

loadLocalEnv();

const [{ PrismaClient }, { runHunterCycle }] = await Promise.all([
  import("@prisma/client"),
  import("../src/server/workers/hunter"),
]);

const db = new PrismaClient({
  log: ["error", "warn"],
});

try {
  const result = await runHunterCycle(
    db,
    {
      telegramBotToken: process.env.TELEGRAM_BOT_TOKEN ?? "",
      telegramChatId: process.env.TELEGRAM_CHAT_ID ?? "",
      scrapeIntervalMs: 10 * 60 * 1_000,
    },
    { enrich: false, jitter: false }
  );

  console.log(
    JSON.stringify(
      {
        ok: result.errors.length === 0,
        cycleNumber: result.cycleNumber,
        totalScraped: result.totalScraped,
        newListings: result.newListings,
        duplicateSkipped: result.duplicateSkipped,
        blacklistedSkipped: result.blacklistedSkipped,
        latencyMs: result.latencyMs,
        errors: result.errors,
      },
      null,
      2
    )
  );

  process.exitCode = result.errors.length === 0 ? 0 : 1;
} catch (error) {
  console.error("Hunter one-shot failed:", (error as Error).message);
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
