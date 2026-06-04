import { describe, expect, it } from 'vitest'
import { Card, DrawnCard, Spread } from '../types'
import { generateAdvancedSpreadSynthesis } from './advancedReadingService'

const cardFixture: Card = {
  id: 0,
  nome: 'O Louco',
  arcano: 'maior',
  arcanoDescricao: 'Arcano Maior',
  numero: 0,
  naipe: null,
  representacao: 'Início de jornada',
  elemento: null,
  numerologia: {
    numero: 0,
    valor: 0,
    titulo: 'Potencial Puro',
    descricao: 'Potencial em aberto.',
  },
  corte: null,
  polaridades: {
    luz: 'novos começos',
    sombra: 'imprudência',
  },
  imagemUrl: '/cards/00_fool.svg',
  significado: {
    vertical: {
      curto: 'novo começo',
      longo: 'Momento favorável para iniciar um novo ciclo.',
    },
    invertido: {
      curto: 'imprudência',
      longo: 'Pede revisão de riscos antes do próximo passo.',
    },
  },
  areas: {
    carreira: 'Abrir uma nova frente profissional.',
    relacionamentos: 'Trazer leveza para a relação.',
    espiritual: 'Confiar na intuição.',
  },
  tags: ['inicio'],
}

const spreadFixture: Spread = {
  id: 'uma-carta',
  nome: 'Uma Carta',
  descricao: 'Orientação rápida',
  positions: [
    {
      index: 1,
      nome: 'Mensagem',
      descricao: 'O que você precisa saber agora.',
    },
  ],
}

describe('advancedReadingService', () => {
  it('retorna mensagem padrão quando não há cartas registradas', () => {
    const synthesis = generateAdvancedSpreadSynthesis({
      spread: spreadFixture,
      orderedDrawn: [],
      cardById: new Map<number, Card>(),
      consultation: null,
    })

    expect(synthesis).toContain('Sem cartas registradas para gerar síntese avançada')
  })

  it('gera síntese com título e progresso da tiragem', () => {
    const orderedDrawn: DrawnCard[] = [
      {
        position: 1,
        cardId: 0,
        cardName: 'O Louco',
        isReversed: false,
        source: 'manual',
        confidence: 1,
      },
    ]

    const synthesis = generateAdvancedSpreadSynthesis({
      spread: spreadFixture,
      orderedDrawn,
      cardById: new Map([[cardFixture.id, cardFixture]]),
      consultation: null,
    })

    expect(synthesis).toContain('Síntese Final da Tiragem: Uma Carta')
    expect(synthesis).toContain('Progresso: 1/1 posições preenchidas.')
  })
})
