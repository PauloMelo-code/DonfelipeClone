import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Quick DB check
    await db.execute(sql`select 1`);
    return NextResponse.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  } catch (error) {
    console.error("[Health] DB check failed:", error);
    return NextResponse.json({
      status: "error",
      error: "database_unreachable",
    }, { status: 503 });
  }
}
