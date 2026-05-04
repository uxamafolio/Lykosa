/**
 * PATCH /api/listings/[id]
 * Update a listing's status or other fields
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();

    const allowedFields = ["status", "agentScore", "phone"];
    const data: any = {};

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        data[field] = body[field];
      }
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
