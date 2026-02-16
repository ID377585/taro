export interface Card {
  id: number
  nome: string
  arcano: 'maior' | 'menor'
  arcanoDescricao?: string
  numero: number
  naipe?: string | null
  representacao?: string
  elemento?: {
    nome: string
    descricao: string
  } | null
  numerologia?: {
    numero: number | null
    valor: number | null
    titulo: string
    descricao: string
  } | null
  corte?: {
    titulo: string
    descricao: string
  } | null
  polaridades?: {
    luz: string
    sombra: string
  }
  imagemUrl: string
  significado: {
    vertical: {
      curto: string
      longo: string
    }
    invertido: {
      curto: string
      longo: string
    }
  }
  areas: {
    carreira: string
    relacionamentos: string
    espiritual: string
  }
  tags: string[]
}

export interface Position {
  index: number
  nome: string
  descricao: string
}

export interface Spread {
  id: string
  nome: string
  descricao: string
  positions: Position[]
}

export interface SpreadingSession {
  id: string
  spreadId: string
  timestamp: number
  spreadName: string
  drawnCards: DrawnCard[]
}

export interface DrawnCard {
  position: number
  cardId: number
  cardName: string
  isReversed: boolean
  source: 'camera' | 'manual'
  confidence?: number
}

export interface RecognitionResult {
  card: Card | null
  isReversed: boolean
  confidence: number
  label?: string
}
