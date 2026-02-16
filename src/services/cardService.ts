import { Card } from '../types'

// Mock cards data - will be replaced with actual cards.json
export const mockCards: Card[] = [
  {
    id: 0,
    nome: 'O Louco',
    arcano: 'maior',
    numero: 0,
    naipe: null,
    imagemUrl: '/cards/00_fool.jpg',
    significado: {
      vertical: {
        curto: 'Novo começo, liberdade, espontaneidade',
        longo:
          'O Louco representa um novo começo repleto de possibilidades infinitas. Ele simboliza a liberdade, a espontaneidade e a disposição para embarcar em uma jornada desconhecida. Este arcano maior convida você a confiar em sua intuição e dar um salto de fé.',
      },
      invertido: {
        curto: 'Impulsividade, inconsideração, falta de direção',
        longo:
          'Quando invertido, O Louco pode indicar impulsividade excessiva, falta de consideração pelas consequências e uma sensação de estar perdido. Pode sugerir a necessidade de pensar antes de agir.',
      },
    },
    areas: {
      carreira: 'Mudança de rumo profissional, novo projeto arrojado',
      relacionamentos: 'Novo romance, abertura para experiências',
      espiritual: 'Despertar espiritual, jornada de autodescoberta',
    },
    tags: ['novo', 'liberdade', 'começo', 'espontaneidade'],
  },
]

export const getCardById = (id: number): Card | undefined => {
  return mockCards.find(card => card.id === id)
}
