export interface TarotReferenceEntry {
  cardName: string
  arcana: 'maior' | 'menor'
  summary: string
  keywords: string[]
}

export const tarotWaiteReference: TarotReferenceEntry[] = [
  {
    cardName: 'O Louco',
    arcana: 'maior',
    summary:
      'Representa início de jornada, abertura ao novo e confiança no desconhecido.',
    keywords: ['começo', 'liberdade', 'fé', 'espontaneidade'],
  },
]
