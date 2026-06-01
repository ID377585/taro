import { describe, expect, it } from 'vitest'
import { applyCardDisplayNames, getCardDisplayNameFromImageUrl } from './cardDisplayName'
import { Card } from '../types'

describe('cardDisplayName', () => {
  it('derives the displayed card name from the official PNG file name', () => {
    expect(getCardDisplayNameFromImageUrl('/cards/tarot-gold-v2/58_nove_de_espadas.png')).toBe(
      'Nove de Espadas',
    )
  })

  it('applies the file-derived name to visible card copy', () => {
    const [card] = applyCardDisplayNames([
      {
        id: 58,
        nome: '9 de Espadas',
        arcano: 'menor',
        numero: 9,
        naipe: 'espadas',
        representacao: 'Representa ansiedade em 9 de Espadas.',
        elemento: null,
        numerologia: null,
        corte: null,
        polaridades: {
          luz: 'ansiedade',
          sombra: 'Sombra de 9 de Espadas',
        },
        imagemUrl: '/cards/tarot-gold-v2/58_nove_de_espadas.png',
        significado: {
          vertical: {
            curto: 'ansiedade',
            longo: '9 de Espadas indica ansiedade.',
          },
          invertido: {
            curto: 'bloqueios ligados a ansiedade',
            longo: '9 de Espadas invertida mostra bloqueios.',
          },
        },
        areas: {
          carreira: '9 de Espadas: aplicação em carreira.',
          relacionamentos: '9 de Espadas: dinâmica afetiva.',
          espiritual: '9 de Espadas: aprendizado interior.',
        },
        tags: [],
      } satisfies Card,
    ])

    expect(card.nome).toBe('Nove de Espadas')
    expect(card.significado.vertical.longo).toContain('Nove de Espadas')
    expect(card.areas.carreira).toContain('Nove de Espadas')
  })
})
