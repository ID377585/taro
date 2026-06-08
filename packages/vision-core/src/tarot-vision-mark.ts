export type TarotVisionBits = {
  idBits: number[];
  groupBits: number[];
  checksumBits: number[];
};

export type TarotVisionDecodedMark = {
  cardId: number;
  groupId: number;
  checksum: number;
  expectedChecksum: number;
  isValid: boolean;
};

export type TarotVisionCardMetadata = {
  id: number;
  title: string;
  group: string;
  groupId: number;
  checksum: number;
  slug: string;
  imageUrl: string;
  fileName: string;
  marker: unknown;
};

export function bitsToNumber(bits: number[]): number {
  return bits.reduce((acc, bit) => (acc << 1) | (bit ? 1 : 0), 0);
}

export function tarotVisionChecksum(cardId: number, groupId: number): number {
  return (cardId ^ (groupId << 1) ^ 0xA) & 0xF;
}

export function decodeTarotVisionMark(bits: TarotVisionBits): TarotVisionDecodedMark {
  const cardId = bitsToNumber(bits.idBits);
  const groupId = bitsToNumber(bits.groupBits);
  const checksum = bitsToNumber(bits.checksumBits);
  const expectedChecksum = tarotVisionChecksum(cardId, groupId);

  return {
    cardId,
    groupId,
    checksum,
    expectedChecksum,
    isValid:
      checksum === expectedChecksum &&
      cardId >= 0 &&
      cardId <= 77 &&
      groupId >= 0 &&
      groupId <= 4,
  };
}

export function findTarotVisionCardByDecodedMark(
  cards: TarotVisionCardMetadata[],
  decoded: TarotVisionDecodedMark
): TarotVisionCardMetadata | null {
  if (!decoded.isValid) return null;

  return (
    cards.find(
      (card) =>
        card.id === decoded.cardId &&
        card.groupId === decoded.groupId &&
        card.checksum === decoded.checksum
    ) ?? null
  );
}
