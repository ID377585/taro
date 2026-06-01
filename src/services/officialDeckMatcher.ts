import { Card } from '../types'

type FeatureTemplate = {
  cardId: number
  url: string
  data: Float32Array
}

export type OfficialDeckMatch = {
  cardId: number
  confidence: number
  score: number
  source: 'official-deck-template'
}

type CropBox = { sx: number; sy: number; sw: number; sh: number; confidence: number }
type Roi = { x: number; y: number; w: number; h: number; weight: number; includeColor: boolean }

const TARGET_WIDTH = 120
const TARGET_HEIGHT = 180
const TARGET_RATIO = 2 / 3

// Evita comparar a moldura inteira, porque ela é quase igual nas 78 cartas.
// O peso maior fica no desenho central e no título inferior, que diferenciam as cartas.
const ROIS: Roi[] = [
  { x: 0.12, y: 0.15, w: 0.76, h: 0.62, weight: 1.6, includeColor: true },
  { x: 0.14, y: 0.79, w: 0.72, h: 0.15, weight: 2.2, includeColor: false },
  { x: 0.34, y: 0.03, w: 0.32, h: 0.12, weight: 1.1, includeColor: false },
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

        // Estrutura de luz/sombra.
        values.push(lum * roi.weight)

        // Gradiente simples para reforçar contornos do desenho e letras.
        const nextX = Math.min(canvas.width - 1, x + 1)
        const nextY = Math.min(canvas.height - 1, y + 1)
        const offsetX = (y * canvas.width + nextX) * 4
        const offsetY = (nextY * canvas.width + x) * 4
        const lumX = luminance(imageData.data[offsetX], imageData.data[offsetX + 1], imageData.data[offsetX + 2])
        const lumY = luminance(imageData.data[offsetY], imageData.data[offsetY + 1], imageData.data[offsetY + 2])
        values.push(Math.abs(lum - lumX) * roi.weight * 2)
        values.push(Math.abs(lum - lumY) * roi.weight * 2)

        if (roi.includeColor) {
          // Cores relativas ajudam a diferenciar roupa/cavalo/céu sem depender do brilho absoluto.
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
  const templates: FeatureTemplate[] = []

  for (const card of cardsWithImages) {
    const image = await loadImage(card.imagemUrl)
    const canvas = drawImageToCardCanvas(image, image.naturalWidth, image.naturalHeight)
    templates.push({
      cardId: card.id,
      url: card.imagemUrl,
      data: canvasToFeatureVector(canvas),
    })
  }

  return templates
}

const ensureTemplates = (cards: Card[]) => {
  const key = cards.map(card => `${card.id}:${card.imagemUrl}`).join('|')
  if (!templatesPromise || templatesKey !== key) {
    templatesKey = key
    templatesPromise = loadTemplates(cards)
  }
  return templatesPromise
}

const locateBrightCardCrop = (video: HTMLVideoElement): CropBox | null => {
  const sourceWidth = video.videoWidth
  const sourceHeight = video.videoHeight
  if (sourceWidth <= 0 || sourceHeight <= 0) return null

  const probeWidth = 360
  const probeHeight = Math.max(1, Math.round(probeWidth * (sourceHeight / sourceWidth)))
  const { canvas: probeCanvas, context: probeContext } = createCanvas(probeWidth, probeHeight)
  probeContext.drawImage(video, 0, 0, probeCanvas.width, probeCanvas.height)
  const imageData = probeContext.getImageData(0, 0, probeCanvas.width, probeCanvas.height)
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

      if (lum > 0.48 && chroma < 0.52) {
        minX = Math.min(minX, x)
        minY = Math.min(minY, y)
        maxX = Math.max(maxX, x)
        maxY = Math.max(maxY, y)
        hits += 1
      }
    }
  }

  if (hits < 140 || maxX <= minX || maxY <= minY) return null

  const scaleX = sourceWidth / probeWidth
  const scaleY = sourceHeight / probeHeight
  const padX = (maxX - minX) * 0.015
  const padY = (maxY - minY) * 0.015

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

  const area = (sw * sh) / (sourceWidth * sourceHeight)
  const ratioConfidence = clamp(1 - Math.abs(sw / sh - TARGET_RATIO) / 0.35, 0, 1)
  const areaConfidence = clamp(area / 0.2, 0, 1)

  return { sx, sy, sw, sh, confidence: ratioConfidence * 0.65 + areaConfidence * 0.35 }
}

const captureVideoFeatureVector = (video: HTMLVideoElement) => {
  const crop = locateBrightCardCrop(video)
  if (!crop || crop.confidence < 0.25) return null

  const { canvas, context } = createCanvas(TARGET_WIDTH, TARGET_HEIGHT)
  context.drawImage(video, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, TARGET_WIDTH, TARGET_HEIGHT)

  return {
    data: canvasToFeatureVector(canvas),
    cropConfidence: crop.confidence,
  }
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

  const captured = captureVideoFeatureVector(video)
  if (!captured) return null

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

  if (!best) return null

  const margin = best.score - secondBestScore
  const confidence = clamp(captured.cropConfidence * 0.25 + (best.score - 0.60) / 0.18 + margin * 2.4, 0, 1)

  // Thresholds mais conservadores para evitar falso positivo. Se não tiver certeza, não confirma.
  if (best.score < 0.69 || margin < 0.028 || confidence < 0.55) return null

  return {
    cardId: best.template.cardId,
    confidence,
    score: best.score,
    source: 'official-deck-template',
  }
}
