export type TarotVisionBits = {
  idBits: number[];
  groupBits: number[];
  checksumBits: number[];
};

export type TarotVisionMarkerSlot = {
  x: number;
  y: number;
  active: boolean;
};

export type TarotVisionMarker = {
  orientation_slots?: TarotVisionMarkerSlot[];
  id_bits_msb_left_to_right: number[];
  group_bits_msb_left_to_right: number[];
  checksum_bits_msb_left_to_right: number[];
  slot_radius_px?: number;
  slot_spacing_px?: number;
  bbox_px?: [number, number, number, number];
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
  marker: TarotVisionMarker;
};

export function bitsToNumber(bits: number[]): number {
  return bits.reduce((acc, bit) => (acc << 1) | (bit ? 1 : 0), 0);
}

export function tarotVisionChecksum(cardId: number, groupId: number): number {
  return (cardId ^ (groupId << 1) ^ 0xA) & 0xF;
}

function normalizeBits(bits: number[], expectedLength: number): number[] {
  if (bits.length !== expectedLength) {
    throw new Error(`Expected ${expectedLength} marker bits, received ${bits.length}.`);
  }

  return bits.map(bit => (bit ? 1 : 0));
}

export function readTarotVisionMarkerBits(marker: TarotVisionMarker): TarotVisionBits {
  return {
    idBits: normalizeBits(marker.id_bits_msb_left_to_right, 7),
    groupBits: normalizeBits(marker.group_bits_msb_left_to_right, 3),
    checksumBits: normalizeBits(marker.checksum_bits_msb_left_to_right, 4),
  };
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

export function decodeTarotVisionMarker(marker: TarotVisionMarker): TarotVisionDecodedMark {
  return decodeTarotVisionMark(readTarotVisionMarkerBits(marker));
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

export function findTarotVisionCardBySlug(
  cards: TarotVisionCardMetadata[],
  cardSlug: string
): TarotVisionCardMetadata | null {
  return cards.find(card => card.slug === cardSlug) ?? null;
}
