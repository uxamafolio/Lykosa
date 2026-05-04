/**
 * POST /api/listings/backfill
 * Trigger backfill enrichment for existing listings that lack phone/price data.
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { backfillListings } from "@/server/workers/hunter";

export async function POST() {
  try {
    const enriched = await backfillListings(db);
    return NextResponse.json({
      success: true,
      enriched,
      message: `Enriched ${enriched} listing(s) with phone/price data`,
    });
  } catch (error) {
    console.error("POST /api/listings/backfill error:", error);
    return NextResponse.json(
      { error: "Failed to run backfill" },
      { status: 500 }
    );
  }
}
