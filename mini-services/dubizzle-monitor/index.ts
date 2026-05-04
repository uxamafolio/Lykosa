/**
 * ═══════════════════════════════════════════════════════════════
 * Lykosa Hunter — Background Monitor Service v2.0
 *
 * PRD v2.1 compliant:
 *   • Uses Prisma DB for persistence (replaces seen_listings.json)
 *   • Imports Hunter Worker with Jitter + Agent Scoring
 *   • 10-minute configurable cron schedule
 *   • Telegram notifications with Shadow Mode support
 *   • Health check endpoint on port 3010
 *
 * Port: 3010 (health check endpoint)
 * ═══════════════════════════════════════════════════════════════
 */

import { createServer } from "http";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { PrismaClient } from "@prisma/client";

// Import Hunter Worker functions
import {
  runHunterCycle,
  getAdminSettings,
  getScrapeIntervalMs,
  type HunterConfig,
  type HunterResult,
} from "../../src/server/workers/hunter";

// ─── Load .env ──────────────────────────────────────────────
const PROJECT_ROOT = join(import.meta.dir, "../..");
const ENV_PATH = join(PROJECT_ROOT, ".env");
if (existsSync(ENV_PATH)) {
  for (const line of readFileSync(ENV_PATH, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

// ─── Database ────────────────────────────────────────────────
const db = new PrismaClient({
  log: ["error", "warn"],
});

// ─── Config ──────────────────────────────────────────────────
const PORT = 3010;
const DEFAULT_INTERVAL_MS = 10 * 60 * 1_000; // 10 minutes

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID ?? "";

const hunterConfig: HunterConfig = {
  telegramBotToken: TELEGRAM_BOT_TOKEN,
  telegramChatId: TELEGRAM_CHAT_ID,
  scrapeIntervalMs: DEFAULT_INTERVAL_MS,
};

// ─── State ───────────────────────────────────────────────────
let isRunning = false;
let lastCycleResult: HunterResult | null = null;
let lastCycleTime: Date | null = null;
let nextCycleTime: Date | null = null;
let totalCycles = 0;
let totalNewListings = 0;

// ─── Health Check Server ─────────────────────────────────────
const server = createServer(async (_req, res) => {
  const listingCount = await db.listing.count();
  const newListings = await db.listing.count({ where: { status: "NEW" } });
  const sentListings = await db.listing.count({ where: { status: "SENT" } });
  const settings = await getAdminSettings(db);

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(
    JSON.stringify(
      {
        status: "running",
        service: "lykosa-hunter",
        version: "2.0.0",
        database: {
          totalListings: listingCount,
          newListings,
          sentListings,
        },
        config: {
          scrapeIntervalMin: settings?.scrapeInterval ?? 10,
          notifyMode: settings?.notifyMode ?? "ALL",
          agentThreshold: settings?.agentThreshold ?? 60,
          telegramConfigured: !!(TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID),
        },
        lastCycle: lastCycleResult
          ? {
              cycleNumber: lastCycleResult.cycleNumber,
              totalScraped: lastCycleResult.totalScraped,
              newListings: lastCycleResult.newListings,
              jitterDelayMs: lastCycleResult.jitterDelayMs,
              latencyMs: lastCycleResult.latencyMs,
              ranAt: lastCycleTime?.toISOString(),
            }
          : null,
        nextCycle: nextCycleTime?.toISOString() ?? "pending",
        uptime: {
          totalCycles,
          totalNewListings,
        },
      },
      null,
      2
    )
  );
});

server.listen(PORT, () => {
  console.log(`🏥 Health check → http://localhost:${PORT}`);
});

// ─── Main Cycle Runner ───────────────────────────────────────

async function runCycle(): Promise<void> {
  if (isRunning) {
    console.log("  ⚠️  Cycle already running — skipping.");
    return;
  }

  isRunning = true;
  totalCycles++;

  try {
    const result = await runHunterCycle(db, hunterConfig);
    lastCycleResult = result;
    lastCycleTime = new Date();
    totalNewListings += result.newListings;

    // Update the scrape interval from admin settings (configurable)
    const intervalMs = await getScrapeIntervalMs(db);
    hunterConfig.scrapeIntervalMs = intervalMs;
  } catch (err) {
    console.error("  ❌ Cycle fatal error:", (err as Error).message);
  } finally {
    isRunning = false;
  }
}

// ─── Scheduler ───────────────────────────────────────────────

async function startMonitor(): Promise<void> {
  console.log(
    "\n" +
      "╔══════════════════════════════════════════════════╗\n" +
      "║  Lykosa Hunter v2.0 — Background Service         ║\n" +
      "║  🔄 Cron: 10 min + Jitter | 📲 Telegram alerts   ║\n" +
      "║  🧠 Agent Scoring | 💾 Prisma DB                  ║\n" +
      "╚══════════════════════════════════════════════════╝\n"
  );

  if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
    console.log(`📲 Telegram: ✅ Chat ID ${TELEGRAM_CHAT_ID}`);
  } else {
    console.log("📲 Telegram: ⚠️ Not configured");
  }

  const listingCount = await db.listing.count();
  console.log(`💾 Database: ${listingCount} existing listing(s)`);

  const settings = await getAdminSettings(db);
  console.log(
    `⚙️  Config: interval=${settings?.scrapeInterval ?? 10}min, mode=${settings?.notifyMode ?? "ALL"}, threshold=${settings?.agentThreshold ?? 60}`
  );
  console.log(`⏱️  Interval: every ${hunterConfig.scrapeIntervalMs / 60_000} min + jitter\n`);

  // Run first cycle immediately
  await runCycle();

  // Schedule recurring cycles
  const scheduleNext = async () => {
    const intervalMs = await getScrapeIntervalMs(db);
    nextCycleTime = new Date(Date.now() + intervalMs);

    setTimeout(async () => {
      await runCycle();
      scheduleNext(); // Schedule the next cycle after this one completes
    }, intervalMs);
  };

  scheduleNext();

  // Keep-alive
  setInterval(() => { /* keep-alive */ }, 30_000);
}

// ─── Graceful Shutdown ───────────────────────────────────────
const shutdown = async (sig: string) => {
  console.log(`\n🛑 ${sig} received. Shutting down…`);
  server.close();
  const final = await db.listing.count();
  console.log(`💾 Final: ${final} listings in database.`);
  await db.$disconnect();
  process.exit(0);
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

// Prevent process from exiting
process.stdin.resume();
process.on("exit", (code) => {
  console.log(`⚠️ Process exiting with code ${code}`);
});

// ─── Start ───────────────────────────────────────────────────
startMonitor();
