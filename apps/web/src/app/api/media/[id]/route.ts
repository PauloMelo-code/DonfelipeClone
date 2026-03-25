import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const media = await prisma.mediaFile.findUnique({
    where: { id },
  });

  if (!media) {
    return new NextResponse("Not found", { status: 404 });
  }

  const buffer = Buffer.from(media.data, "base64");

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": media.mimeType,
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Length": buffer.length.toString(),
    },
  });
}
