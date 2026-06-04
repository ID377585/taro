import { NextResponse } from "next/server";
import { z } from "zod";
import { createReadingSession, getDashboardSnapshot } from "@/lib/reading-service";
import { auth } from "@/auth";

const createReadingSchema = z.object({
  readingTypeId: z.string().min(1),
  notes: z.string().optional(),
  primary: z.object({
    fullName: z.string().min(2),
    birthDate: z.string().optional(),
    phone: z.string().optional(),
  }),
  secondary: z
    .object({
      fullName: z.string().min(2),
      birthDate: z.string().optional(),
      phone: z.string().optional(),
    })
    .optional()
    .nullable(),
});

export async function GET() {
  const session = await auth();
  if (!session?.user?.id || !session.user.role) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const snapshot = await getDashboardSnapshot({
    id: session.user.id,
    role: session.user.role,
  });

  return NextResponse.json(snapshot);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const json = await request.json();
  const parsed = createReadingSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const result = await createReadingSession({
    tarologistId: session.user.id,
    ...parsed.data,
  });

  return NextResponse.json({
    id: result.reading.id,
    roomCode: result.reading.roomCode,
    guestToken: result.guestToken,
  });
}
