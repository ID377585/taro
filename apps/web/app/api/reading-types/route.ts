import { NextResponse } from "next/server";
import { getActiveReadingTypes } from "@/lib/reading-service";

export async function GET() {
  const readingTypes = await getActiveReadingTypes();
  return NextResponse.json(
    readingTypes.map(type => ({
      id: type.id,
      slug: type.slug,
      name: type.name,
      description: type.description,
      cardsCount: type.cardsCount,
    })),
  );
}
