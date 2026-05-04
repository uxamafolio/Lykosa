/**
 * GET /api/admin-settings
 * PUT /api/admin-settings
 *
 * Manage the single AdminSetting record (PRD §4.4 — Control Center)
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

const DEFAULT_BLACKLIST = [
  "agent",
  "broker",
  "agency",
  "real estate",
  "property management",
];

function parseBlacklist(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function normalizeNumber(value: unknown, min: number, max: number): number | null {
  const numberValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numberValue)) return null;
  return Math.max(min, Math.min(max, Math.round(numberValue)));
}

export async function GET() {
  try {
    let settings = await db.adminSetting.findFirst();

    if (!settings) {
      // Create default settings
      settings = await db.adminSetting.create({
        data: {
          blacklistKeywords: JSON.stringify(DEFAULT_BLACKLIST),
          scrapeInterval: 10,
          notifyMode: "ALL",
          agentThreshold: 60,
        },
      });
    }

    // Parse blacklist for the frontend
    const parsedSettings = {
      ...settings,
      blacklistKeywords: parseBlacklist(settings.blacklistKeywords),
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
      if (!Array.isArray(blacklistKeywords)) {
        return NextResponse.json(
          { error: "blacklistKeywords must be an array of strings" },
          { status: 400 }
        );
      }

      const normalizedKeywords = blacklistKeywords
        .filter((kw): kw is string => typeof kw === "string")
        .map((kw) => kw.trim().toLowerCase())
        .filter(Boolean);

      // Store as JSON string so the UI and worker share one portable shape.
      data.blacklistKeywords = JSON.stringify([...new Set(normalizedKeywords)]);
    }
    if (scrapeInterval !== undefined) {
      const normalized = normalizeNumber(scrapeInterval, 1, 1440);
      if (normalized === null) {
        return NextResponse.json(
          { error: "scrapeInterval must be a number" },
          { status: 400 }
        );
      }
      data.scrapeInterval = normalized; // 1 min to 24 hrs
    }
    if (notifyMode !== undefined) {
      data.notifyMode = notifyMode === "VERIFIED_ONLY" ? "VERIFIED_ONLY" : "ALL";
    }
    if (agentThreshold !== undefined) {
      const normalized = normalizeNumber(agentThreshold, 0, 100);
      if (normalized === null) {
        return NextResponse.json(
          { error: "agentThreshold must be a number" },
          { status: 400 }
        );
      }
      data.agentThreshold = normalized;
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
      blacklistKeywords: parseBlacklist(settings.blacklistKeywords),
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
