/**
 * GET /api/admin-settings
 * PUT /api/admin-settings
 *
 * Manage the single AdminSetting record (PRD §4.4 — Control Center)
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  try {
    let settings = await db.adminSetting.findFirst();

    if (!settings) {
      // Create default settings
      settings = await db.adminSetting.create({
        data: {
          blacklistKeywords: JSON.stringify([
            "agent",
            "broker",
            "agency",
            "real estate",
            "property management",
          ]),
          scrapeInterval: 10,
          notifyMode: "ALL",
          agentThreshold: 60,
        },
      });
    }

    // Parse blacklist for the frontend
    const parsedSettings = {
      ...settings,
      blacklistKeywords: JSON.parse(settings.blacklistKeywords),
    };

    return NextResponse.json({ settings: parsedSettings });
  } catch (error) {
    console.error("GET /api/admin-settings error:", error);
    return NextResponse.json(
      { error: "Failed to fetch settings" },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { blacklistKeywords, scrapeInterval, notifyMode, agentThreshold } = body;

    let settings = await db.adminSetting.findFirst();

    const data: any = {};

    if (blacklistKeywords !== undefined) {
      // Store as JSON string for SQLite compatibility
      data.blacklistKeywords = JSON.stringify(blacklistKeywords);
    }
    if (scrapeInterval !== undefined) {
      data.scrapeInterval = Math.max(1, Math.min(1440, scrapeInterval)); // 1 min to 24 hrs
    }
    if (notifyMode !== undefined) {
      data.notifyMode = notifyMode === "VERIFIED_ONLY" ? "VERIFIED_ONLY" : "ALL";
    }
    if (agentThreshold !== undefined) {
      data.agentThreshold = Math.max(0, Math.min(100, agentThreshold));
    }

    if (settings) {
      settings = await db.adminSetting.update({
        where: { id: settings.id },
        data,
      });
    } else {
      settings = await db.adminSetting.create({
        data: {
          blacklistKeywords: data.blacklistKeywords || JSON.stringify(["agent", "broker"]),
          scrapeInterval: data.scrapeInterval || 10,
          notifyMode: data.notifyMode || "ALL",
          agentThreshold: data.agentThreshold ?? 60,
        },
      });
    }

    const parsedSettings = {
      ...settings,
      blacklistKeywords: JSON.parse(settings.blacklistKeywords),
    };

    return NextResponse.json({ settings: parsedSettings });
  } catch (error) {
    console.error("PUT /api/admin-settings error:", error);
    return NextResponse.json(
      { error: "Failed to update settings" },
      { status: 500 }
    );
  }
}
