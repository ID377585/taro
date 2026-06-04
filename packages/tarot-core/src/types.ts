export type CardOrientation = "UPRIGHT" | "REVERSED";

export interface TarotCardSeed {
  legacyId: number;
  name: string;
  slug: string;
  arcana: string;
  suit: string | null;
  number: number | null;
  imageUrl: string | null;
  uprightText: string;
  reversedText: string | null;
  keywords: string[];
  areaMessages: Record<string, string>;
}

export interface ReadingTypeSeed {
  name: string;
  slug: string;
  description: string;
  defaultSpread: string;
  cardsCount: number;
  openingScript: string;
  closingScript: string;
  promptTemplate: string;
  sourceSpreadId: string;
}

export interface TeleprompterScriptInput {
  readingTypeName: string;
  readingTypeDescription?: string | null;
  openingScript?: string | null;
  closingScript?: string | null;
  primaryClientName: string;
  secondaryClientName?: string | null;
  positionLabel: string;
  positionIndex?: number;
  totalCards?: number;
  card: Pick<TarotCardSeed, "name" | "uprightText" | "reversedText" | "keywords" | "areaMessages">;
  orientation: CardOrientation;
  previousCards: string[];
}
