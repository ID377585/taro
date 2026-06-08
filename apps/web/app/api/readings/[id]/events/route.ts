import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { appendReadingEventForHost, getReadingByIdForHost } from "@/lib/reading-service";

const eventSchema = z.object({
  eventType: z.string().min(2),
  payload: z.record(z.string(), z.unknown()).optional(),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id || !session.user.role) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const reading = await getReadingByIdForHost(id, {
    id: session.user.id,
    role: session.user.role,
  });

  if (!reading) {
    return NextResponse.json({ error: "Reading not found." }, { status: 404 });
  }

  return NextResponse.json(
    reading.events.map(event => ({
      id: event.id,
      eventType: event.eventType,
      payload: event.payload,
      createdAt: event.createdAt,
    })),
  );
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id || !session.user.role) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const parsed = eventSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const event = await appendReadingEventForHost({
    readingId: id,
    user: {
      id: session.user.id,
      role: session.user.role,
    },
    eventType: parsed.data.eventType,
    payload: parsed.data.payload,
  });

  if (!event) {
    return NextResponse.json({ error: "Reading not found." }, { status: 404 });
  }

  return NextResponse.json(event);
}
