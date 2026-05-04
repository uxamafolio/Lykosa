/**
 * GET /api/listings
 * List all listings with filters: status, agentScore range, search, pagination
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    // Filters
    const status = searchParams.get("status"); // "NEW" | "SENT" | "IGNORED"
    const search = searchParams.get("search");
    const agentScoreMin = parseInt(searchParams.get("agentScoreMin") || "0");
    const agentScoreMax = parseInt(searchParams.get("agentScoreMax") || "100");
    const sortBy = searchParams.get("sortBy") || "createdAt";
    const sortOrder = searchParams.get("sortOrder") === "asc" ? "asc" : "desc";

    // Pagination
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "50")));
    const skip = (page - 1) * limit;

    // Build where clause
    const where: any = {};

    if (status) {
      where.status = status;
    }

    if (search) {
      where.title = { contains: search };
    }

    if (agentScoreMin > 0 || agentScoreMax < 100) {
      where.agentScore = { gte: agentScoreMin, lte: agentScoreMax };
    }

    const [listings, total] = await Promise.all([
      db.listing.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        skip,
        take: limit,
      }),
      db.listing.count({ where }),
    ]);

    // Add lead latency calculation
    const listingsWithLatency = listings.map((l) => ({
      ...l,
      leadLatency:
        l.sourceListedAt && l.createdAt
          ? Math.round((l.createdAt.getTime() - l.sourceListedAt.getTime()) / 1_000)
          : null,
    }));

    return NextResponse.json({
      listings: listingsWithLatency,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("GET /api/listings error:", error);
    return NextResponse.json(
      { error: "Failed to fetch listings" },
      { status: 500 }
    );
  }
}
