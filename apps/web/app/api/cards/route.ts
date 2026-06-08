import { NextResponse } from "next/server";
import { prisma } from "@taro/database";
import { auth } from "@/auth";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cards = await prisma.tarotCard.findMany({
    orderBy: [{ arcana: "asc" }, { legacyId: "asc" }],
  });

  return NextResponse.json(
    cards.map(card => ({
      id: card.id,
      legacyId: card.legacyId,
      name: card.name,
      slug: card.slug,
      arcana: card.arcana,
      suit: card.suit,
      number: card.number,
      imageUrl: card.imageUrl,
      keywords: card.keywords,
    })),
  );
}
