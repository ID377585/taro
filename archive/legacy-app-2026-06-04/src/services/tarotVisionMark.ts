export type TarotVisionBits = {
  idBits: number[];      // 7 bits, MSB left-to-right
  groupBits: number[];   // 3 bits, MSB left-to-right
  checksumBits: number[];// 4 bits, MSB left-to-right
};

export function bitsToNumber(bits: number[]): number {
  return bits.reduce((acc, bit) => (acc << 1) | (bit ? 1 : 0), 0);
}

export function tarotVisionChecksum(cardId: number, groupId: number): number {
  return (cardId ^ (groupId << 1) ^ 0xA) & 0xF;
}

export function decodeTarotVisionMark(bits: TarotVisionBits) {
  const cardId = bitsToNumber(bits.idBits);
  const groupId = bitsToNumber(bits.groupBits);
  const checksum = bitsToNumber(bits.checksumBits);
  const expectedChecksum = tarotVisionChecksum(cardId, groupId);
  return {
    cardId,
    groupId,
    checksum,
    expectedChecksum,
    isValid: checksum === expectedChecksum && cardId >= 0 && cardId <= 77 && groupId >= 0 && groupId <= 4,
  };
}
