/**
 * GET /api/listings
 * List all listings with filters: status, agentScore range, search, pagination
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

const VALID_STATUSES = new Set(["NEW", "SENT", "IGNORED"]);
const VALID_SORT_FIELDS = new Set([
  "createdAt",
  "updatedAt",
  "price",
  "agentScore",
  "title",
  "status",
]);

function parseBoundedInt(value: string | null, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(value || "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    // Filters
    const status = searchParams.get("status"); // "NEW" | "SENT" | "IGNORED"
    const search = searchParams.get("search");
    const agentScoreMin = parseBoundedInt(searchParams.get("agentScoreMin"), 0, 0, 100);
    const agentScoreMax = parseBoundedInt(searchParams.get("agentScoreMax"), 100, 0, 100);
    const requestedSortBy = searchParams.get("sortBy") || "createdAt";
    const sortBy = VALID_SORT_FIELDS.has(requestedSortBy)
      ? requestedSortBy
      : "createdAt";
    const sortOrder = searchParams.get("sortOrder") === "asc" ? "asc" : "desc";

    // Pagination
    const page = parseBoundedInt(searchParams.get("page"), 1, 1, 10_000);
    const limit = parseBoundedInt(searchParams.get("limit"), 50, 1, 100);
    const skip = (page - 1) * limit;

    // Build where clause
    const where: any = {};

    if (status && VALID_STATUSES.has(status)) {
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
