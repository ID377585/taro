import { NextResponse } from "next/server";
import { z } from "zod";
import {
  detectMockCard,
  getTarotVisionCardBySlug,
  type BoundingBox,
  type DetectionCandidate,
  type DetectionSource,
} from "@taro/vision-core";
import { getPublicRuntimeConfig } from "@/lib/env";

const detectSchema = z.object({
  imageBase64: z.string().optional(),
  cardHint: z.string().optional(),
});

const boundingBoxSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});

const externalDetectionSchema = z.object({
  cardId: z.number().optional(),
  cardSlug: z.string(),
  cardName: z.string().optional(),
  confidence: z.number(),
  boundingBox: boundingBoxSchema,
  source: z.enum(["marker", "mock", "manual"]).optional(),
  isValid: z.boolean().optional(),
  timestamp: z.union([z.number(), z.string()]).optional(),
});

const timestampToNumber = (timestamp: number | string | undefined) => {
  if (typeof timestamp === "number") return timestamp;
  if (typeof timestamp === "string") return Date.parse(timestamp);
  return Date.now();
};

const fallbackDetection = (
  cardSlug: string | undefined,
  source: DetectionSource,
  confidence?: number,
  boundingBox?: BoundingBox,
): DetectionCandidate[] => {
  const [candidate] = detectMockCard(cardSlug, { source, confidence });
  if (!candidate) return [];

  return [
    {
      ...candidate,
      boundingBox: boundingBox ?? candidate.boundingBox,
      timestamp: Date.now(),
    },
  ];
};

const normalizeDetections = (
  payload: unknown,
  fallbackSource: DetectionSource,
): DetectionCandidate[] => {
  const parsed = z.array(externalDetectionSchema).safeParse(payload);
  if (!parsed.success) return [];

  return parsed.data.flatMap(item => {
    const card = getTarotVisionCardBySlug(item.cardSlug);
    if (!card || item.cardId === undefined || !item.cardName || item.isValid === undefined) {
      return fallbackDetection(item.cardSlug, fallbackSource, item.confidence, item.boundingBox);
    }

    return [
      {
        cardId: item.cardId,
        cardSlug: item.cardSlug,
        cardName: item.cardName,
        confidence: item.confidence,
        boundingBox: item.boundingBox,
        source: item.source ?? fallbackSource,
        isValid: item.isValid,
        timestamp: timestampToNumber(item.timestamp),
      },
    ];
  });
};

export async function POST(request: Request) {
  const parsed = detectSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const fallbackSource: DetectionSource = parsed.data.cardHint ? "manual" : "mock";
  const { visionServiceUrl } = getPublicRuntimeConfig();

  try {
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

    if (response.ok) {
      const detections = normalizeDetections(await response.json(), fallbackSource);
      if (detections.length > 0) {
        return NextResponse.json(detections);
      }
    }
  } catch {
    // The first marker version is local and deterministic; the Python service is optional here.
  }

  return NextResponse.json(fallbackDetection(parsed.data.cardHint, fallbackSource));
}
