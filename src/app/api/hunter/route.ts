/**
 * GET /api/hunter
 * Get hunter status for the GitHub Actions scheduled runner.
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const scheduleMinutes = Number.parseInt(
      process.env.HUNTER_SCHEDULE_MINUTES || "15",
      10
    );
    const [listingCount, newListings, sentListings, settings, latestListing] =
      await Promise.all([
        db.listing.count(),
        db.listing.count({ where: { status: "NEW" } }),
        db.listing.count({ where: { status: "SENT" } }),
        db.adminSetting.findFirst(),
        db.listing.findFirst({ orderBy: { createdAt: "desc" } }),
      ]);

    return NextResponse.json(
      {
        status: "scheduled",
        service: "github-actions-hunter",
        version: "2.0.0",
        database: {
          totalListings: listingCount,
          newListings,
          sentListings,
        },
        config: {
          scrapeIntervalMin: Number.isFinite(scheduleMinutes) ? scheduleMinutes : 15,
          notifyMode: settings?.notifyMode ?? "ALL",
          agentThreshold: settings?.agentThreshold ?? 60,
          telegramConfigured: !!(
            process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID
          ),
        },
        lastCycle: null,
        lastListingAt: latestListing?.createdAt.toISOString() ?? null,
        nextCycle: null,
        uptime: {
          totalCycles: 0,
          totalNewListings: listingCount,
        },
      }
    );
  } catch (error: any) {
    console.error("GET /api/hunter error:", error);
    return NextResponse.json(
      {
        status: "error",
        message: "Hunter status unavailable",
        error: error.code || error.message,
      },
      { status: 500 }
    );
  }
}
