import { describe, expect, it } from 'vitest'
import {
  normalizeLabelValue,
  parseModelLabel,
  matchCardFromModelLabel,
  createCardLookup,
} from './labelService'
import { Card } from '../types'

const cardFixture: Card[] = [
  {
    id: 0,
    nome: 'O Louco',
    arcano: 'maior',
    numero: 0,
    naipe: null,
    imagemUrl: '/cards/00_fool.svg',
    significado: {
      vertical: { curto: 'novo começo', longo: 'novo começo longo' },
      invertido: { curto: 'imprudência', longo: 'imprudência longa' },
    },
    areas: {
      carreira: 'carreira',
      relacionamentos: 'relacionamentos',
      espiritual: 'espiritual',
    },
    tags: ['teste'],
  },
]

describe('labelService', () => {
  it('normaliza labels removendo acentos e espaços', () => {
    expect(normalizeLabelValue('Ás de Copas')).toBe('as-de-copas')
  })

  it('detecta orientação invertida no label do modelo', () => {
    expect(parseModelLabel('00_fool_invertido').orientation).toBe('invertido')
    expect(parseModelLabel('00_fool_vertical').orientation).toBe('vertical')
  })

  it('resolve carta pelo nome de arquivo da imagem', () => {
    const lookup = createCardLookup(cardFixture)
    const match = matchCardFromModelLabel('00_fool_vertical', lookup)
    expect(match.card?.id).toBe(0)
  })
})
