import { Card } from '../types'

export type CardOrientation = 'vertical' | 'invertido'

const reversedTokens = new Set([
  'invertida',
  'invertido',
  'invertid',
  'inverted',
  'reversed',
  'reverse',
  'reversa',
  'rx',
  'down',
  'upside',
  'baixo',
])

const uprightTokens = new Set([
  'vertical',
  'upright',
  'normal',
  'up',
  'direita',
])

export const normalizeLabelValue = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/_+/g, '-')
    .replace(/-+/g, '-')
    .trim()

const tokenize = (value: string) =>
  normalizeLabelValue(value)
    .split('-')
    .map(token => token.trim())
    .filter(Boolean)

const removeOrientationTokens = (tokens: string[]) =>
  tokens.filter(token => !reversedTokens.has(token) && !uprightTokens.has(token))

const hasReversedToken = (tokens: string[]) =>
  tokens.some(token => reversedTokens.has(token))

export const parseModelLabel = (label: string) => {
  const tokens = tokenize(label)
  const strippedTokens = removeOrientationTokens(tokens)

  return {
    normalized: normalizeLabelValue(label),
    base: strippedTokens.join('-'),
    orientation: hasReversedToken(tokens)
      ? ('invertido' as CardOrientation)
      : ('vertical' as CardOrientation),
  }
}

export const createCardLookup = (cards: Card[]) => {
  const byKey = new Map<string, Card>()

  cards.forEach(card => {
    const rawImageName = card.imagemUrl.split('/').pop()?.replace(/\.[^/.]+$/, '')
    const imageName = rawImageName ? normalizeLabelValue(rawImageName) : ''
    const cardId = `${card.id}`
    const paddedId = card.id.toString().padStart(2, '0')

    byKey.set(cardId, card)
    byKey.set(paddedId, card)
    byKey.set(normalizeLabelValue(card.nome), card)
    if (imageName) {
      byKey.set(imageName, card)
    }
  })

  return byKey
}

export interface ModelLabelMatch {
  card: Card | null
  orientation: CardOrientation
  normalizedLabel: string
  baseLabel: string
}

export const matchCardFromModelLabel = (
  label: string,
  lookup: Map<string, Card>,
): ModelLabelMatch => {
  const parsed = parseModelLabel(label)
  const card =
    lookup.get(parsed.base) ||
    lookup.get(parsed.normalized) ||
    lookup.get(parsed.base.replace(/-+/g, '-')) ||
    null

  return {
    card,
    orientation: parsed.orientation,
    normalizedLabel: parsed.normalized,
    baseLabel: parsed.base,
  }
}
