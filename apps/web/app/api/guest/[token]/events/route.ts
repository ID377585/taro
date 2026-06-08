import { NextResponse } from "next/server";
import { z } from "zod";
import { appendReadingEventByGuestToken } from "@/lib/reading-service";

const eventSchema = z.object({
  eventType: z.string().min(2),
  payload: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const parsed = eventSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const event = await appendReadingEventByGuestToken({
    token,
    eventType: parsed.data.eventType,
    payload: parsed.data.payload,
  });

  if (!event) {
    return NextResponse.json({ error: "Guest link not found." }, { status: 404 });
  }

  return NextResponse.json({
    id: event.id,
    eventType: event.eventType,
    createdAt: event.createdAt,
  });
}
