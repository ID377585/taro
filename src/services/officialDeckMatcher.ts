import { Card } from '../types'

type GrayTemplate = {
  cardId: number
  url: string
  data: Float32Array
  mean: number
  variance: number
}

export type OfficialDeckMatch = {
  cardId: number
  confidence: number
  score: number
  source: 'official-deck-template'
}

const TARGET_WIDTH = 48
const TARGET_HEIGHT = 72
const TARGET_RATIO = 2 / 3

let templatesPromise: Promise<GrayTemplate[]> | null = null

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const luminance = (r: number, g: number, b: number) => (0.299 * r + 0.587 * g + 0.114 * b) / 255

const normalizeArray = (values: Float32Array) => {
  let sum = 0
  for (let i = 0; i < values.length; i += 1) sum += values[i]
  const mean = sum / values.length

  let varianceSum = 0
  for (let i = 0; i < values.length; i += 1) {
    const diff = values[i] - mean
    varianceSum += diff * diff
  }
  const variance = Math.sqrt(varianceSum / values.length) || 1

  const normalized = new Float32Array(values.length)
  for (let i = 0; i < values.length; i += 1) {
    normalized[i] = (values[i] - mean) / variance
  }

  return { normalized, mean, variance }
}

const canvasToGrayTemplate = (canvas: HTMLCanvasElement) => {
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('Canvas indisponível para leitura do baralho oficial.')
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height)
  const values = new Float32Array(canvas.width * canvas.height)

  for (let i = 0, pixel = 0; i < imageData.data.length; i += 4, pixel += 1) {
    values[pixel] = luminance(imageData.data[i], imageData.data[i + 1], imageData.data[i + 2])
  }

  return normalizeArray(values)
}

const drawImageToTemplateCanvas = (image: CanvasImageSource, sourceWidth: number, sourceHeight: number) => {
  const canvas = document.createElement('canvas')
  canvas.width = TARGET_WIDTH
  canvas.height = TARGET_HEIGHT
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('Canvas indisponível para normalização do baralho oficial.')

  const sourceRatio = sourceWidth / sourceHeight
  let sx = 0
  let sy = 0
  let sw = sourceWidth
  let sh = sourceHeight

  if (sourceRatio > TARGET_RATIO) {
    sw = Math.floor(sourceHeight * TARGET_RATIO)
    sx = Math.floor((sourceWidth - sw) / 2)
  } else {
    sh = Math.floor(sourceWidth / TARGET_RATIO)
    sy = Math.floor((sourceHeight - sh) / 2)
  }

  context.drawImage(image, sx, sy, sw, sh, 0, 0, TARGET_WIDTH, TARGET_HEIGHT)
  return canvas
}

const loadImage = (url: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(`Falha ao carregar imagem oficial: ${url}`))
    image.src = url
  })

const loadTemplates = async (cards: Card[]): Promise<GrayTemplate[]> => {
  const cardsWithImages = cards.filter(card => card.imagemUrl && card.imagemUrl.includes('/cards/tarot-gold-v2/'))
  const templates: GrayTemplate[] = []

  for (const card of cardsWithImages) {
    const image = await loadImage(card.imagemUrl)
    const canvas = drawImageToTemplateCanvas(image, image.naturalWidth, image.naturalHeight)
    const { normalized, mean, variance } = canvasToGrayTemplate(canvas)
    templates.push({
      cardId: card.id,
      url: card.imagemUrl,
      data: normalized,
      mean,
      variance,
    })
  }

  return templates
}

const locateBrightCardCrop = (video: HTMLVideoElement) => {
  const sourceWidth = video.videoWidth
  const sourceHeight = video.videoHeight
  if (sourceWidth <= 0 || sourceHeight <= 0) return null

  const probeWidth = 320
  const probeHeight = Math.max(1, Math.round(probeWidth * (sourceHeight / sourceWidth)))
  const probeCanvas = document.createElement('canvas')
  probeCanvas.width = probeWidth
  probeCanvas.height = probeHeight
  const probeContext = probeCanvas.getContext('2d', { willReadFrequently: true })
  if (!probeContext) return null

  probeContext.drawImage(video, 0, 0, probeWidth, probeHeight)
  const imageData = probeContext.getImageData(0, 0, probeWidth, probeHeight)
  const { data } = imageData

  let minX = probeWidth
  let minY = probeHeight
  let maxX = -1
  let maxY = -1
  let hits = 0

  for (let y = 0; y < probeHeight; y += 2) {
    for (let x = 0; x < probeWidth; x += 2) {
      const offset = (y * probeWidth + x) * 4
      const r = data[offset]
      const g = data[offset + 1]
      const b = data[offset + 2]
      const lum = luminance(r, g, b)
      const chroma = (Math.max(r, g, b) - Math.min(r, g, b)) / 255

      if (lum > 0.52 && chroma < 0.45) {
        minX = Math.min(minX, x)
        minY = Math.min(minY, y)
        maxX = Math.max(maxX, x)
        maxY = Math.max(maxY, y)
        hits += 1
      }
    }
  }

  if (hits < 120 || maxX <= minX || maxY <= minY) return null

  const scaleX = sourceWidth / probeWidth
  const scaleY = sourceHeight / probeHeight
  const padX = (maxX - minX) * 0.03
  const padY = (maxY - minY) * 0.03

  let sx = clamp((minX - padX) * scaleX, 0, sourceWidth - 1)
  let sy = clamp((minY - padY) * scaleY, 0, sourceHeight - 1)
  let sw = clamp((maxX - minX + padX * 2) * scaleX, 1, sourceWidth - sx)
  let sh = clamp((maxY - minY + padY * 2) * scaleY, 1, sourceHeight - sy)

  const ratio = sw / sh
  if (ratio > TARGET_RATIO) {
    const nextWidth = sh * TARGET_RATIO
    sx += (sw - nextWidth) / 2
    sw = nextWidth
  } else {
    const nextHeight = sw / TARGET_RATIO
    sy += (sh - nextHeight) / 2
    sh = nextHeight
  }

  return { sx, sy, sw, sh }
}

const captureVideoTemplate = (video: HTMLVideoElement) => {
  const crop = locateBrightCardCrop(video)
  if (!crop) return null

  const canvas = document.createElement('canvas')
  canvas.width = TARGET_WIDTH
  canvas.height = TARGET_HEIGHT
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return null

  context.drawImage(video, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, TARGET_WIDTH, TARGET_HEIGHT)
  return canvasToGrayTemplate(canvas).normalized
}

const similarityScore = (a: Float32Array, b: Float32Array) => {
  let dot = 0
  const length = Math.min(a.length, b.length)
  for (let i = 0; i < length; i += 1) dot += a[i] * b[i]
  const correlation = dot / length
  return clamp((correlation + 1) / 2, 0, 1)
}

export async function matchOfficialDeckFromVideo(video: HTMLVideoElement, cards: Card[]): Promise<OfficialDeckMatch | null> {
  if (!templatesPromise) templatesPromise = loadTemplates(cards)
  const templates = await templatesPromise
  if (!templates.length) return null

  const captured = captureVideoTemplate(video)
  if (!captured) return null

  let best: { template: GrayTemplate; score: number } | null = null
  let secondBestScore = 0

  for (const template of templates) {
    const score = similarityScore(captured, template.data)
    if (!best || score > best.score) {
      secondBestScore = best?.score ?? 0
      best = { template, score }
    } else if (score > secondBestScore) {
      secondBestScore = score
    }
  }

  if (!best) return null

  const margin = best.score - secondBestScore
  const confidence = clamp((best.score - 0.58) / 0.18 + margin * 1.8, 0, 1)

  if (best.score < 0.66 || margin < 0.018 || confidence < 0.45) return null

  return {
    cardId: best.template.cardId,
    confidence,
    score: best.score,
    source: 'official-deck-template',
  }
}
