import { Card } from '../types'

const tokenDisplay = new Map<string, string>([
  ['as', 'Ás'],
  ['dois', 'Dois'],
  ['tres', 'Três'],
  ['quatro', 'Quatro'],
  ['cinco', 'Cinco'],
  ['seis', 'Seis'],
  ['sete', 'Sete'],
  ['oito', 'Oito'],
  ['nove', 'Nove'],
  ['dez', 'Dez'],
  ['pajem', 'Pajem'],
  ['cavaleiro', 'Cavaleiro'],
  ['rainha', 'Rainha'],
  ['rei', 'Rei'],
  ['o', 'O'],
  ['a', 'A'],
])

const lowercaseTokens = new Set(['de', 'da', 'do', 'das', 'dos', 'e'])

const titleToken = (token: string, index: number) => {
  const normalized = token.toLowerCase()
  if (index > 0 && lowercaseTokens.has(normalized)) return normalized
  return tokenDisplay.get(normalized) || `${normalized.charAt(0).toLocaleUpperCase('pt-BR')}${normalized.slice(1)}`
}

export const getCardDisplayNameFromImageUrl = (imagemUrl: string) => {
  const fileName = imagemUrl.split('/').pop()?.replace(/\.[^/.]+$/, '') || ''
  const nameFromFile = fileName.replace(/^\d+[_-]+/, '')
  if (!nameFromFile) return ''

  return nameFromFile
    .split(/[_-]+/)
    .filter(Boolean)
    .map(titleToken)
    .join(' ')
}

const replaceCardName = (value: string | undefined, currentName: string, displayName: string) => {
  if (!value || currentName === displayName) return value
  return value.split(currentName).join(displayName)
}

export const applyCardDisplayNames = (cards: Card[]) =>
  cards.map(card => {
    const displayName = getCardDisplayNameFromImageUrl(card.imagemUrl)
    if (!displayName || displayName === card.nome) return card

    return {
      ...card,
      nome: displayName,
      representacao: replaceCardName(card.representacao, card.nome, displayName),
      polaridades: card.polaridades
        ? {
            luz: replaceCardName(card.polaridades.luz, card.nome, displayName) || card.polaridades.luz,
            sombra: replaceCardName(card.polaridades.sombra, card.nome, displayName) || card.polaridades.sombra,
          }
        : card.polaridades,
      significado: {
        vertical: {
          curto: card.significado.vertical.curto,
          longo:
            replaceCardName(card.significado.vertical.longo, card.nome, displayName) ||
            card.significado.vertical.longo,
        },
        invertido: {
          curto: card.significado.invertido.curto,
          longo:
            replaceCardName(card.significado.invertido.longo, card.nome, displayName) ||
            card.significado.invertido.longo,
        },
      },
      areas: {
        carreira: replaceCardName(card.areas.carreira, card.nome, displayName) || card.areas.carreira,
        relacionamentos:
          replaceCardName(card.areas.relacionamentos, card.nome, displayName) ||
          card.areas.relacionamentos,
        espiritual: replaceCardName(card.areas.espiritual, card.nome, displayName) || card.areas.espiritual,
      },
    }
  })
