import { Card } from '../types'
import { expandCropVariants, locateLargestBrightComponent, scaleCropBox } from './brightComponentCrop'

type FeatureTemplate = {
  cardId: number
  url: string
  data: Float32Array
}

export type OfficialDeckMatch = {
  cardId: number
  confidence: number
  score: number
  isReversed: boolean
  source: 'official-deck-template'
}

type Roi = { x: number; y: number; w: number; h: number; weight: number; includeColor: boolean }
type CapturedFeatureVector = { data: Float32Array; cropConfidence: number; isReversed: boolean }

const TARGET_WIDTH = 144
const TARGET_HEIGHT = 216
const TARGET_RATIO = 2 / 3

const ROIS: Roi[] = [
  { x: 0.12, y: 0.14, w: 0.76, h: 0.6, weight: 1.75, includeColor: true },
  { x: 0.15, y: 0.78, w: 0.7, h: 0.16, weight: 2.55, includeColor: false },
  { x: 0.33, y: 0.03, w: 0.34, h: 0.12, weight: 1, includeColor: false },
  { x: 0.24, y: 0.53, w: 0.52, h: 0.14, weight: 1.15, includeColor: true },
]

let templatesPromise: Promise<FeatureTemplate[]> | null = null
let templatesKey = ''

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const luminance = (r: number, g: number, b: number) => (0.299 * r + 0.587 * g + 0.114 * b) / 255

const normalizeArray = (values: number[]) => {
  if (!values.length) return new Float32Array()

  let sum = 0
  for (const value of values) sum += value
  const mean = sum / values.length

  let varianceSum = 0
  for (const value of values) {
    const diff = value - mean
    varianceSum += diff * diff
  }

  const variance = Math.sqrt(varianceSum / values.length) || 1
  const normalized = new Float32Array(values.length)
  for (let i = 0; i < values.length; i += 1) {
    normalized[i] = (values[i] - mean) / variance
  }
  return normalized
}

const createCanvas = (width: number, height: number) => {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('Canvas indisponível para reconhecimento do baralho oficial.')
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  return { canvas, context }
}

const drawImageToCardCanvas = (image: CanvasImageSource, sourceWidth: number, sourceHeight: number) => {
  const { canvas, context } = createCanvas(TARGET_WIDTH, TARGET_HEIGHT)
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

const canvasToFeatureVector = (canvas: HTMLCanvasElement) => {
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('Canvas indisponível para extrair features do baralho oficial.')

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height)
  const values: number[] = []

  for (const roi of ROIS) {
    const x0 = Math.max(0, Math.floor(roi.x * canvas.width))
    const y0 = Math.max(0, Math.floor(roi.y * canvas.height))
    const x1 = Math.min(canvas.width - 1, Math.ceil((roi.x + roi.w) * canvas.width))
    const y1 = Math.min(canvas.height - 1, Math.ceil((roi.y + roi.h) * canvas.height))

    for (let y = y0; y <= y1; y += 2) {
      for (let x = x0; x <= x1; x += 2) {
        const offset = (y * canvas.width + x) * 4
        const r = imageData.data[offset] / 255
        const g = imageData.data[offset + 1] / 255
        const b = imageData.data[offset + 2] / 255
        const lum = luminance(imageData.data[offset], imageData.data[offset + 1], imageData.data[offset + 2])
        const nextX = Math.min(canvas.width - 1, x + 1)
        const nextY = Math.min(canvas.height - 1, y + 1)
        const offsetX = (y * canvas.width + nextX) * 4
        const offsetY = (nextY * canvas.width + x) * 4
        const lumX = luminance(imageData.data[offsetX], imageData.data[offsetX + 1], imageData.data[offsetX + 2])
        const lumY = luminance(imageData.data[offsetY], imageData.data[offsetY + 1], imageData.data[offsetY + 2])

        values.push(lum * roi.weight)
        values.push(Math.abs(lum - lumX) * roi.weight * 2)
        values.push(Math.abs(lum - lumY) * roi.weight * 2)

        if (roi.includeColor) {
          values.push((r - g) * roi.weight * 0.85)
          values.push((b - (r + g) / 2) * roi.weight * 0.85)
        }
      }
    }
  }

  return normalizeArray(values)
}

const loadImage = (url: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(`Falha ao carregar imagem oficial: ${url}`))
    image.src = url
  })

const loadTemplates = async (cards: Card[]): Promise<FeatureTemplate[]> => {
  const cardsWithImages = cards.filter(card => card.imagemUrl && card.imagemUrl.includes('/cards/tarot-gold-v2/'))

  return Promise.all(cardsWithImages.map(async card => {
    const image = await loadImage(card.imagemUrl)
    const canvas = drawImageToCardCanvas(image, image.naturalWidth, image.naturalHeight)
    return {
      cardId: card.id,
      url: card.imagemUrl,
      data: canvasToFeatureVector(canvas),
    }
  }))
}

const ensureTemplates = (cards: Card[]) => {
  const key = cards.map(card => `${card.id}:${card.imagemUrl}`).join('|')
  if (!templatesPromise || templatesKey !== key) {
    templatesKey = key
    templatesPromise = loadTemplates(cards)
  }
  return templatesPromise
}

export const preloadOfficialDeckTemplates = (cards: Card[]) => {
  void ensureTemplates(cards).catch(() => undefined)
}

const rotateCanvas180 = (source: HTMLCanvasElement) => {
  const { canvas, context } = createCanvas(source.width, source.height)
  context.translate(source.width, source.height)
  context.rotate(Math.PI)
  context.drawImage(source, 0, 0)
  return canvas
}

const captureVideoFeatureVectors = (video: HTMLVideoElement): CapturedFeatureVector[] => {
  const sourceWidth = video.videoWidth
  const sourceHeight = video.videoHeight
  if (sourceWidth <= 0 || sourceHeight <= 0) return []

  const probeWidth = 360
  const probeHeight = Math.max(1, Math.round(probeWidth * (sourceHeight / sourceWidth)))
  const { canvas: probeCanvas, context: probeContext } = createCanvas(probeWidth, probeHeight)

  probeContext.drawImage(video, 0, 0, probeCanvas.width, probeCanvas.height)
  const probeImage = probeContext.getImageData(0, 0, probeCanvas.width, probeCanvas.height)
  const probeCrop = locateLargestBrightComponent(probeImage, {
    targetRatio: TARGET_RATIO,
    brightnessThreshold: 0.46,
    chromaThreshold: 0.58,
    cellSize: 3,
    minHits: 30,
    padRatio: 0.022,
  })

  if (!probeCrop) return []

  const scaledBaseCrop = scaleCropBox(probeCrop, sourceWidth / probeWidth, sourceHeight / probeHeight)
  const outputs: CapturedFeatureVector[] = []

  for (const crop of expandCropVariants(scaledBaseCrop, sourceWidth, sourceHeight)) {
    const { canvas, context } = createCanvas(TARGET_WIDTH, TARGET_HEIGHT)
    context.drawImage(video, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, TARGET_WIDTH, TARGET_HEIGHT)

    outputs.push({
      data: canvasToFeatureVector(canvas),
      cropConfidence: crop.confidence,
      isReversed: false,
    })

    const rotated = rotateCanvas180(canvas)
    outputs.push({
      data: canvasToFeatureVector(rotated),
      cropConfidence: crop.confidence * 0.98,
      isReversed: true,
    })
  }

  return outputs
}

const similarityScore = (a: Float32Array, b: Float32Array) => {
  let dot = 0
  const length = Math.min(a.length, b.length)
  if (!length) return 0

  for (let i = 0; i < length; i += 1) dot += a[i] * b[i]
  const correlation = dot / length
  return clamp((correlation + 1) / 2, 0, 1)
}

export async function matchOfficialDeckFromVideo(video: HTMLVideoElement, cards: Card[]): Promise<OfficialDeckMatch | null> {
  const templates = await ensureTemplates(cards)
  if (!templates.length) return null

  const captures = captureVideoFeatureVectors(video)
  if (!captures.length) return null

  let bestMatch: {
    template: FeatureTemplate
    score: number
    margin: number
    confidence: number
    isReversed: boolean
  } | null = null

  for (const captured of captures) {
    let best: { template: FeatureTemplate; score: number } | null = null
    let secondBestScore = 0

    for (const template of templates) {
      const score = similarityScore(captured.data, template.data)
      if (!best || score > best.score) {
        secondBestScore = best?.score ?? 0
        best = { template, score }
      } else if (score > secondBestScore) {
        secondBestScore = score
      }
    }

    if (!best) continue

    const margin = best.score - secondBestScore
    const confidence = clamp(captured.cropConfidence * 0.28 + (best.score - 0.58) / 0.18 + margin * 2.2, 0, 1)

    if (
      !bestMatch ||
      confidence > bestMatch.confidence ||
      (Math.abs(confidence - bestMatch.confidence) < 0.0001 && best.score > bestMatch.score)
    ) {
      bestMatch = {
        template: best.template,
        score: best.score,
        margin,
        confidence,
        isReversed: captured.isReversed,
      }
    }
  }

  if (!bestMatch) return null
  if (bestMatch.score < 0.64 || bestMatch.margin < 0.018 || bestMatch.confidence < 0.46) return null

  return {
    cardId: bestMatch.template.cardId,
    confidence: bestMatch.confidence,
    score: bestMatch.score,
    isReversed: bestMatch.isReversed,
    source: 'official-deck-template',
  }
}
