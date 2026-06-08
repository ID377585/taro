import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import {
  appendLiveSignalForHost,
  getLiveSignalsForHost,
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
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id || !session.user.role) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const signals = await getLiveSignalsForHost({
    readingId: id,
    user: {
      id: session.user.id,
      role: session.user.role,
    },
  });

  if (!signals) {
    return NextResponse.json({ error: "Reading not found." }, { status: 404 });
  }

  return NextResponse.json(signals.map(serializeSignal));
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id || !session.user.role) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = signalSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { id } = await params;
  const signal = await appendLiveSignalForHost({
    readingId: id,
    user: {
      id: session.user.id,
      role: session.user.role,
    },
    eventType: parsed.data.eventType,
    payload: parsed.data.payload,
  });

  if (!signal) {
    return NextResponse.json({ error: "Reading not found or signal not allowed." }, { status: 404 });
  }

  return NextResponse.json(serializeSignal(signal));
}
