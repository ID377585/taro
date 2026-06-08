import { NextResponse } from "next/server";
import { getReadingByGuestToken } from "@/lib/reading-service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const guestLink = await getReadingByGuestToken(token);

  if (!guestLink) {
    return NextResponse.json({ error: "Guest link not found." }, { status: 404 });
  }

  return NextResponse.json({
    readingId: guestLink.readingId,
    roomCode: guestLink.reading.roomCode,
    readingType: guestLink.reading.readingType.name,
    primaryClient: guestLink.reading.clients[0]?.client.fullName ?? "Consulente",
  });
}
