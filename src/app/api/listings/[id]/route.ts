/**
 * PATCH /api/listings/[id]
 * Update a listing's status or other fields
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

const VALID_STATUSES = new Set(["NEW", "SENT", "IGNORED"]);

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();

    const data: any = {};

    if (body.status !== undefined) {
      if (typeof body.status !== "string" || !VALID_STATUSES.has(body.status)) {
        return NextResponse.json(
          { error: "status must be NEW, SENT, or IGNORED" },
          { status: 400 }
        );
      }
      data.status = body.status;
    }

    if (body.agentScore !== undefined) {
      const agentScore = Number(body.agentScore);
      if (!Number.isFinite(agentScore)) {
        return NextResponse.json(
          { error: "agentScore must be a number" },
          { status: 400 }
        );
      }
      data.agentScore = Math.max(0, Math.min(100, Math.round(agentScore)));
    }

    if (body.phone !== undefined) {
      if (body.phone !== null && typeof body.phone !== "string") {
        return NextResponse.json(
          { error: "phone must be a string or null" },
          { status: 400 }
        );
      }
      data.phone = body.phone?.trim() || null;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { error: "No supported fields provided" },
        { status: 400 }
      );
    }

    const listing = await db.listing.update({
      where: { id },
      data,
    });

    return NextResponse.json({ listing });
  } catch (error: any) {
    if (error?.code === "P2025") {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }
    console.error("PATCH /api/listings/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to update listing" },
      { status: 500 }
    );
  }
}
