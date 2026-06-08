import { NextResponse } from "next/server";
import { ReadingStatus } from "@prisma/client";
import { z } from "zod";
import { auth } from "@/auth";
import { updateReadingStatus } from "@/lib/reading-service";

const statusSchema = z.object({
  status: z.enum([
    ReadingStatus.DRAFT,
    ReadingStatus.LIVE,
    ReadingStatus.FINISHED,
    ReadingStatus.CANCELED,
  ]),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id || !session.user.role) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const parsed = statusSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const reading = await updateReadingStatus({
    readingId: id,
    user: {
      id: session.user.id,
      role: session.user.role,
    },
    status: parsed.data.status,
  });

  if (!reading) {
    return NextResponse.json({ error: "Reading not found." }, { status: 404 });
  }

  return NextResponse.json(reading);
}
