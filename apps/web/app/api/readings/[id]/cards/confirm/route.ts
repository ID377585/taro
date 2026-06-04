import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { confirmReadingCard } from "@/lib/reading-service";

const confirmCardSchema = z.object({
  cardSlug: z.string().min(1),
  position: z.number().int().min(1),
  orientation: z.enum(["UPRIGHT", "REVERSED"]),
  confidence: z.number().min(0).max(1).optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id || !session.user.role) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const json = await request.json();
  const parsed = confirmCardSchema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const card = await confirmReadingCard({
    readingId: id,
    user: {
      id: session.user.id,
      role: session.user.role,
    },
    cardSlug: parsed.data.cardSlug,
    position: parsed.data.position,
    orientation: parsed.data.orientation,
    confidence: parsed.data.confidence,
  });

  if (!card) {
    return NextResponse.json({ error: "Reading or card not found." }, { status: 404 });
  }

  return NextResponse.json(card);
}
