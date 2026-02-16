import { Spread } from '../types'

// Mock spreads data - will be replaced with actual spreads.json
export const mockSpreads: Spread[] = [
  {
    id: 'uma-carta',
    nome: 'Uma Carta',
    descricao: 'Orientação rápida para uma questão específica',
    positions: [
      {
        index: 1,
        nome: 'Mensagem',
        descricao: 'O que você precisa saber agora',
      },
    ],
  },
  {
    id: 'tres-cartas',
    nome: 'Três Cartas',
    descricao: 'Passado, Presente e Futuro',
    positions: [
      {
        index: 1,
        nome: 'Passado',
        descricao: 'Influências que moldaram a situação',
      },
      {
        index: 2,
        nome: 'Presente',
        descricao: 'A situação atual',
      },
      {
        index: 3,
        nome: 'Futuro',
        descricao: 'Tendência provável',
      },
    ],
  },
  {
    id: 'cruz-celta',
    nome: 'Cruz Celta',
    descricao: 'Análise profunda em 10 posições',
    positions: [
      {
        index: 1,
        nome: 'Situação',
        descricao: 'O coração da questão',
      },
      {
        index: 2,
        nome: 'Desafio',
        descricao: 'O obstáculo ou suporte',
      },
      {
        index: 3,
        nome: 'Base',
        descricao: 'As raízes da situação',
      },
      {
        index: 4,
        nome: 'Passado Recente',
        descricao: 'Influências saindo de cena',
      },
      {
        index: 5,
        nome: 'Coroa',
        descricao: 'O que o consulente busca ou aspira',
      },
      {
        index: 6,
        nome: 'Futuro Próximo',
        descricao: 'O que está se desenvolvendo',
      },
      {
        index: 7,
        nome: 'Atitude',
        descricao: 'Como a pessoa se sente',
      },
      {
        index: 8,
        nome: 'Influências Externas',
        descricao: 'Fatores externos que afetam',
      },
      {
        index: 9,
        nome: 'Esperanças e Medos',
        descricao: 'Ansiedades ou desejos profundos',
      },
      {
        index: 10,
        nome: 'Resultado Final',
        descricao: 'A provável conclusão',
      },
    ],
  },
]

export const getSpreadById = (id: string): Spread | undefined => {
  return mockSpreads.find(spread => spread.id === id)
}
