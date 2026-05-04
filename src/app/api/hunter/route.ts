/**
 * GET /api/hunter
 * Get hunter service status from the mini-service health check
 */
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const res = await fetch("http://localhost:3010/", {
      signal: AbortSignal.timeout(5_000),
    });

    if (!res.ok) {
      return NextResponse.json(
        { status: "error", message: `Hunter service returned ${res.status}` },
        { status: 502 }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    // Service might not be running
    return NextResponse.json(
      {
        status: "offline",
        message: "Hunter service is not reachable",
        error: error.code || error.message,
      },
      { status: 503 }
    );
  }
}
