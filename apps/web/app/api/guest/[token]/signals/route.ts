import { NextResponse } from "next/server";
import { z } from "zod";
import {
  appendLiveSignalByGuestToken,
  getLiveSignalsByGuestToken,
} from "@/lib/reading-service";

const signalSchema = z.object({
  eventType: z.string().startsWith("live."),
  payload: z.record(z.string(), z.unknown()).optional(),
});

const serializeSignal = (event: {
  id: string;
  eventType: string;
  payload: unknown;
  createdAt: Date;
}) => ({
  id: event.id,
  eventType: event.eventType,
  payload: event.payload,
  createdAt: event.createdAt.toISOString(),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const signals = await getLiveSignalsByGuestToken(token);

  if (!signals) {
    return NextResponse.json({ error: "Guest link not found." }, { status: 404 });
  }

  return NextResponse.json(signals.map(serializeSignal));
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const parsed = signalSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const signal = await appendLiveSignalByGuestToken({
    token,
    eventType: parsed.data.eventType,
    payload: parsed.data.payload,
  });

  if (!signal) {
    return NextResponse.json({ error: "Guest link not found or signal not allowed." }, { status: 404 });
  }

  return NextResponse.json(serializeSignal(signal));
}
