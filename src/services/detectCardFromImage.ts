import { decodeTarotVisionMark, TarotVisionBits } from './tarotVisionMark'

export interface TarotVisionDetection {
  cardId: number
  groupId: number
  checksum: number
  expectedChecksum: number
  isReversed: boolean
  confidence: number
  source: 'tarot-vision-mark'
  bits: TarotVisionBits
}

type SamplePoint = { x: number; y: number }

const TARGET_WIDTH = 420
const TARGET_HEIGHT = 630
const TARGET_RATIO = 2 / 3

// Coordenadas normalizadas do Tarot Vision Mark v2 dentro de uma carta isolada.
// Os pontos foram pensados para ficar na moldura, sem depender da arte central.
const MARK_POINTS = {
  orientation: [
    { x: 0.075, y: 0.06 },
    { x: 0.11, y: 0.06 },
    { x: 0.075, y: 0.095 },
    { x: 0.075, y: 0.13 },
  ],
  id: Array.from({ length: 7 }, (_, index) => ({ x: 0.71 + index * 0.035, y: 0.06 })),
  group: Array.from({ length: 3 }, (_, index) => ({ x: 0.11 + index * 0.035, y: 0.84 })),
  checksum: Array.from({ length: 4 }, (_, index) => ({ x: 0.72 + index * 0.035, y: 0.84 })),
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const luminanceAt = (imageData: ImageData, px: number, py: number, radius = 2) => {
  const { width, height, data } = imageData
  const x0 = clamp(Math.round(px) - radius, 0, width - 1)
  const x1 = clamp(Math.round(px) + radius, 0, width - 1)
  const y0 = clamp(Math.round(py) - radius, 0, height - 1)
  const y1 = clamp(Math.round(py) + radius, 0, height - 1)
  let total = 0
  let count = 0

  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const offset = (y * width + x) * 4
      const r = data[offset]
      const g = data[offset + 1]
      const b = data[offset + 2]
      total += (0.299 * r + 0.587 * g + 0.114 * b) / 255
      count += 1
    }
  }

  return count ? total / count : 1
}

const drawCoverCrop = (
  sourceWidth: number,
  sourceHeight: number,
  draw: (sx: number, sy: number, sw: number, sh: number) => void,
) => {
  if (!sourceWidth || !sourceHeight) return

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

  draw(sx, sy, sw, sh)
}

const normalizePoint = (point: SamplePoint, reversed: boolean): SamplePoint => {
  if (!reversed) return point
  return { x: 1 - point.x, y: 1 - point.y }
}

const sampleSlot = (imageData: ImageData, point: SamplePoint, reversed: boolean) => {
  const normalized = normalizePoint(point, reversed)
  const x = normalized.x * imageData.width
  const y = normalized.y * imageData.height
  const center = luminanceAt(imageData, x, y, 2)

  // Pontos ativos têm centro marrom escuro/fosco. Pontos inativos são vazados.
  const active = center < 0.58
  const confidence = active ? clamp((0.58 - center) / 0.38, 0, 1) : clamp((center - 0.50) / 0.38, 0, 1)

  return { active, confidence, luminance: center }
}

const readBits = (imageData: ImageData, points: SamplePoint[], reversed: boolean) => {
  const samples = points.map(point => sampleSlot(imageData, point, reversed))
  return {
    bits: samples.map(sample => (sample.active ? 1 : 0)),
    confidence: samples.reduce((sum, sample) => sum + sample.confidence, 0) / samples.length,
  }
}

const readCandidate = (imageData: ImageData, reversed: boolean): TarotVisionDetection | null => {
  const orientation = MARK_POINTS.orientation.map(point => sampleSlot(imageData, point, reversed))
  const orientationScore = orientation.filter(sample => sample.active).length / orientation.length
  const orientationConfidence = orientation.reduce((sum, sample) => sum + sample.confidence, 0) / orientation.length

  if (orientationScore < 0.75) return null

  const id = readBits(imageData, MARK_POINTS.id, reversed)
  const group = readBits(imageData, MARK_POINTS.group, reversed)
  const checksum = readBits(imageData, MARK_POINTS.checksum, reversed)

  const bits: TarotVisionBits = {
    idBits: id.bits,
    groupBits: group.bits,
    checksumBits: checksum.bits,
  }
  const decoded = decodeTarotVisionMark(bits)
  if (!decoded.isValid) return null

  return {
    cardId: decoded.cardId,
    groupId: decoded.groupId,
    checksum: decoded.checksum,
    expectedChecksum: decoded.expectedChecksum,
    isReversed: reversed,
    confidence: clamp(
      orientationConfidence * 0.35 + id.confidence * 0.3 + group.confidence * 0.15 + checksum.confidence * 0.2,
      0,
      1,
    ),
    source: 'tarot-vision-mark',
    bits,
  }
}

const createMarkerCanvas = () => {
  const canvas = document.createElement('canvas')
  canvas.width = TARGET_WIDTH
  canvas.height = TARGET_HEIGHT
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('Não foi possível inicializar canvas do Tarot Vision Mark.')
  return { canvas, context }
}

export function detectTarotVisionMarkFromVideo(video: HTMLVideoElement): TarotVisionDetection | null {
  if (video.videoWidth <= 0 || video.videoHeight <= 0) return null

  const { canvas, context } = createMarkerCanvas()
  context.clearRect(0, 0, canvas.width, canvas.height)
  drawCoverCrop(video.videoWidth, video.videoHeight, (sx, sy, sw, sh) => {
    context.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
  })

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height)
  const upright = readCandidate(imageData, false)
  const reversed = readCandidate(imageData, true)

  if (upright && reversed) return upright.confidence >= reversed.confidence ? upright : reversed
  return upright || reversed
}

export async function detectTarotVisionMarkFromBlob(blob: Blob): Promise<TarotVisionDetection | null> {
  const { canvas, context } = createMarkerCanvas()

  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(blob)
    try {
      drawCoverCrop(bitmap.width, bitmap.height, (sx, sy, sw, sh) => {
        context.drawImage(bitmap, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
      })
    } finally {
      bitmap.close()
    }
  } else {
    await new Promise<void>((resolve, reject) => {
      const image = new Image()
      const objectUrl = URL.createObjectURL(blob)
      image.onload = () => {
        try {
          drawCoverCrop(image.naturalWidth, image.naturalHeight, (sx, sy, sw, sh) => {
            context.drawImage(image, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
          })
          resolve()
        } catch (error) {
          reject(error)
        } finally {
          URL.revokeObjectURL(objectUrl)
        }
      }
      image.onerror = () => {
        URL.revokeObjectURL(objectUrl)
        reject(new Error('Não foi possível decodificar imagem para ler Tarot Vision Mark.'))
      }
      image.src = objectUrl
    })
  }

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height)
  const upright = readCandidate(imageData, false)
  const reversed = readCandidate(imageData, true)
  if (upright && reversed) return upright.confidence >= reversed.confidence ? upright : reversed
  return upright || reversed
}
