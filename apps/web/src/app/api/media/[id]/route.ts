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

  // Fix mimeType for images stored with wrong content-type
  let contentType = media.mimeType;
  if (contentType === "application/octet-stream" || contentType.startsWith("application/")) {
    contentType = "image/jpeg";
  }

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Length": buffer.length.toString(),
    },
  });
}
