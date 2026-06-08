import { describe, expect, it } from 'vitest'
import { Card, SpreadingSession, Spread } from '../types'
import { buildSessionFullReport } from './sessionReportService'

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

const sessionFixture: SpreadingSession = {
  id: 'session-1',
  spreadId: 'uma-carta',
  spreadName: 'Uma Carta',
  timestamp: Date.now(),
  intake: {
    tipo: 'pessoal',
    pessoa1: {
      nomeCompleto: 'Maria da Silva',
      sexo: 'feminino',
    },
    pessoa2: null,
    situacaoPrincipal: 'Quero clareza para os próximos passos.',
    createdAt: Date.now(),
  },
  drawnCards: [
    {
      position: 1,
      cardId: 0,
      cardName: 'O Louco',
      isReversed: false,
      source: 'manual',
      confidence: 1,
    },
  ],
}

describe('sessionReportService', () => {
  it('gera relatório completo com blocos principais e conteúdo de carta', () => {
    const report = buildSessionFullReport({
      session: sessionFixture,
      spread: spreadFixture,
      cardById: new Map([[cardFixture.id, cardFixture]]),
    })

    expect(report).toContain('RELATÓRIO COMPLETO DE LEITURA')
    expect(report).toContain('BLOCO 1 - DADOS DO ATENDIMENTO')
    expect(report).toContain('BLOCO 2 - LEITURA E SIGNIFICADOS DAS CARTAS')
    expect(report).toContain('BLOCO 3 - SÍNTESE FINAL')
    expect(report).toContain('Maria da Silva')
    expect(report).toContain('Carta sorteada: O Louco (Vertical)')
  })

  it('usa síntese de fallback quando a tiragem não está no catálogo', () => {
    const report = buildSessionFullReport({
      session: sessionFixture,
      spread: null,
      cardById: new Map([[cardFixture.id, cardFixture]]),
    })

    expect(report).toContain('Não foi possível localizar a configuração da tiragem')
  })
})
