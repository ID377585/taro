import { NextResponse } from "next/server";
import { z } from "zod";
import { getPublicRuntimeConfig } from "@/lib/env";

const detectSchema = z.object({
  imageBase64: z.string().optional(),
  cardHint: z.string().optional(),
});

export async function POST(request: Request) {
  const parsed = detectSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { visionServiceUrl } = getPublicRuntimeConfig();
  const response = await fetch(`${visionServiceUrl}/detect`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      image_base64: parsed.data.imageBase64,
      card_hint: parsed.data.cardHint,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: `Vision service failed with HTTP ${response.status}` },
      { status: 502 },
    );
  }

  const payload = await response.json();
  return NextResponse.json(payload);
}
