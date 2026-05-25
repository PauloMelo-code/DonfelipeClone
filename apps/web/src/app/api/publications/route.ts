import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));
    const search = searchParams.get("search") || "";
    const status = searchParams.get("status") || "";

    const where: Record<string, unknown> = {};

    if (status === "success") {
      where.success = true;
    } else if (status === "failed") {
      where.success = false;
    }

    if (search) {
      where.vehicle = {
        OR: [
          { model: { contains: search, mode: "insensitive" } },
          { brand: { contains: search, mode: "insensitive" } },
        ],
      };
    }

    const [posts, total] = await Promise.all([
      prisma.postHistory.findMany({
        where,
        include: {
          vehicle: {
            select: {
              id: true,
              model: true,
              brand: true,
              year: true,
              km: true,
              price: true,
              sellingPrice: true,
              photos: true,
              formattedAd: true,
            },
          },
          targetGroup: {
            select: {
              groupId: true,
              name: true,
            },
          },
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
        orderBy: { postedAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.postHistory.count({ where }),
    ]);

    return NextResponse.json({
      posts,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("[Publications] Error:", error);
    return NextResponse.json(
      { error: "Erro ao carregar historico de publicacoes" },
      { status: 500 }
    );
  }
}
