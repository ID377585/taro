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
type CropBox = { sx: number; sy: number; sw: number; sh: number; confidence: number }

const TARGET_WIDTH = 420
const TARGET_HEIGHT = 630
const TARGET_RATIO = 2 / 3

const MARK_POINTS = {
  orientation: [
    { x: 0.065, y: 0.055 },
    { x: 0.098, y: 0.055 },
    { x: 0.065, y: 0.088 },
    { x: 0.065, y: 0.122 },
  ],
  id: Array.from({ length: 7 }, (_, index) => ({ x: 0.655 + index * 0.037, y: 0.055 })),
  group: Array.from({ length: 3 }, (_, index) => ({ x: 0.075 + index * 0.04, y: 0.825 })),
  checksum: Array.from({ length: 4 }, (_, index) => ({ x: 0.705 + index * 0.04, y: 0.825 })),
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const luminance = (r: number, g: number, b: number) => (0.299 * r + 0.587 * g + 0.114 * b) / 255

const luminanceAt = (imageData: ImageData, px: number, py: number, radius = 3) => {
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
      total += luminance(data[offset], data[offset + 1], data[offset + 2])
      count += 1
    }
  }

  return count ? total / count : 1
}

const darknessRatio = (imageData: ImageData, px: number, py: number, radius = 5) => {
  const { width, height, data } = imageData
  const x0 = clamp(Math.round(px) - radius, 0, width - 1)
  const x1 = clamp(Math.round(px) + radius, 0, width - 1)
  const y0 = clamp(Math.round(py) - radius, 0, height - 1)
  const y1 = clamp(Math.round(py) + radius, 0, height - 1)
  let dark = 0
  let total = 0

  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const offset = (y * width + x) * 4
      const lum = luminance(data[offset], data[offset + 1], data[offset + 2])
      if (lum < 0.45) dark += 1
      total += 1
    }
  }

  return total ? dark / total : 0
}

const locateCardCrop = (imageData: ImageData): CropBox | null => {
  const { width, height, data } = imageData
  const step = Math.max(2, Math.floor(Math.min(width, height) / 260))
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  let hits = 0

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const offset = (y * width + x) * 4
      const lum = luminance(data[offset], data[offset + 1], data[offset + 2])
      const r = data[offset]
      const g = data[offset + 1]
      const b = data[offset + 2]
      const chroma = (Math.max(r, g, b) - Math.min(r, g, b)) / 255

      // As cartas têm fundo branco/marfim. Esta etapa localiza a área clara da carta
      // dentro do frame da câmera, em vez de presumir que a carta preenche todo o vídeo.
      if (lum > 0.52 && chroma < 0.56) {
        minX = Math.min(minX, x)
        minY = Math.min(minY, y)
        maxX = Math.max(maxX, x)
        maxY = Math.max(maxY, y)
        hits += 1
      }
    }
  }

  if (hits < 80 || maxX <= minX || maxY <= minY) return null

  const padX = Math.round((maxX - minX) * 0.01)
  const padY = Math.round((maxY - minY) * 0.01)
  const sx = clamp(minX - padX, 0, width - 1)
  const sy = clamp(minY - padY, 0, height - 1)
  const ex = clamp(maxX + padX, 0, width - 1)
  const ey = clamp(maxY + padY, 0, height - 1)
  const sw = ex - sx
  const sh = ey - sy
  if (sw <= 0 || sh <= 0) return null

  const ratio = sw / sh
  const ratioError = Math.abs(ratio - TARGET_RATIO) / TARGET_RATIO

  // Rejeita enquadramentos parciais. A câmera precisa ver a carta inteira.
  if (ratioError > 0.38) return null
  if (sw < width * 0.18 || sh < height * 0.35) return null

  return {
    sx,
    sy,
    sw,
    sh,
    confidence: clamp(1 - ratioError / 0.38, 0, 1),
  }
}

const drawCropToTarget = (
  sourceWidth: number,
  sourceHeight: number,
  context: CanvasRenderingContext2D,
  draw: (sx: number, sy: number, sw: number, sh: number) => void,
  crop?: CropBox | null,
) => {
  if (!sourceWidth || !sourceHeight) return

  if (crop) {
    draw(crop.sx, crop.sy, crop.sw, crop.sh)
    return
  }

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

  context.clearRect(0, 0, TARGET_WIDTH, TARGET_HEIGHT)
  draw(sx, sy, sw, sh)
}

const normalizePoint = (point: SamplePoint, reversed: boolean): SamplePoint => {
  if (!reversed) return point
  return { x: 1 - point.x, y: 1 - point.y }
}

const sampleSlot = (imageData: ImageData, point: SamplePoint, reversed: boolean) => {
  const normalized = normalizePoint(point, reversed)
  const baseX = normalized.x * imageData.width
  const baseY = normalized.y * imageData.height

  const offsets = [
    [0, 0],
    [-3, 0], [3, 0], [0, -3], [0, 3],
    [-5, -3], [5, -3], [-5, 3], [5, 3],
  ]

  let best = { center: 1, localDarkness: 0, confidence: 0 }

  for (const [ox, oy] of offsets) {
    const x = baseX + ox
    const y = baseY + oy
    const center = luminanceAt(imageData, x, y, 4)
    const background = luminanceAt(imageData, x, y, 11)
    const localDarkness = darknessRatio(imageData, x, y, 5)
    const contrast = background - center

    const score =
      clamp((0.64 - center) / 0.44, 0, 1) * 0.55 +
      clamp(contrast / 0.20, 0, 1) * 0.25 +
      clamp((localDarkness - 0.18) / 0.34, 0, 1) * 0.20

    if (score > best.confidence) {
      best = { center, localDarkness, confidence: score }
    }
  }

  const active = best.center < 0.64 && best.localDarkness > 0.16 && best.confidence > 0.32
  const inactiveConfidence = best.center >= 0.50 ? clamp((best.center - 0.50) / 0.34, 0, 1) : 0

  return {
    active,
    confidence: active ? best.confidence : inactiveConfidence,
    luminance: best.center,
  }
}

const readBits = (imageData: ImageData, points: SamplePoint[], reversed: boolean) => {
  const samples = points.map(point => sampleSlot(imageData, point, reversed))
  return {
    bits: samples.map(sample => (sample.active ? 1 : 0)),
    activeCount: samples.filter(sample => sample.active).length,
    confidence: samples.reduce((sum, sample) => sum + sample.confidence, 0) / samples.length,
  }
}

const readCandidate = (
  imageData: ImageData,
  reversed: boolean,
  cropConfidence = 1,
): TarotVisionDetection | null => {
  const orientation = MARK_POINTS.orientation.map(point => sampleSlot(imageData, point, reversed))
  const orientationScore = orientation.filter(sample => sample.active).length / orientation.length
  const orientationConfidence = orientation.reduce((sum, sample) => sum + sample.confidence, 0) / orientation.length

  if (orientationScore < 0.75 || orientationConfidence < 0.35) return null

  const id = readBits(imageData, MARK_POINTS.id, reversed)
  const group = readBits(imageData, MARK_POINTS.group, reversed)
  const checksum = readBits(imageData, MARK_POINTS.checksum, reversed)

  if (id.confidence < 0.18 || group.confidence < 0.18 || checksum.confidence < 0.18) return null

  const bits: TarotVisionBits = {
    idBits: id.bits,
    groupBits: group.bits,
    checksumBits: checksum.bits,
  }
  const decoded = decodeTarotVisionMark(bits)
  if (!decoded.isValid) return null

  const dataActiveCount = id.activeCount + group.activeCount + checksum.activeCount

  // Protecao contra falso positivo comum: leitura cair em ornamentos e validar ID 0.
  if (decoded.cardId === 0 && (dataActiveCount < 3 || checksum.confidence < 0.55)) return null

  return {
    cardId: decoded.cardId,
    groupId: decoded.groupId,
    checksum: decoded.checksum,
    expectedChecksum: decoded.expectedChecksum,
    isReversed: reversed,
    confidence: clamp(
      cropConfidence * 0.25 + orientationConfidence * 0.25 + id.confidence * 0.25 + group.confidence * 0.1 + checksum.confidence * 0.15,
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

  const rawCanvas = document.createElement('canvas')
  rawCanvas.width = video.videoWidth
  rawCanvas.height = video.videoHeight
  const rawContext = rawCanvas.getContext('2d', { willReadFrequently: true })
  if (!rawContext) return null
  rawContext.drawImage(video, 0, 0, rawCanvas.width, rawCanvas.height)
  const rawImage = rawContext.getImageData(0, 0, rawCanvas.width, rawCanvas.height)
  const crop = locateCardCrop(rawImage)
  if (!crop) return null

  const { canvas, context } = createMarkerCanvas()
  context.clearRect(0, 0, canvas.width, canvas.height)
  drawCropToTarget(video.videoWidth, video.videoHeight, context, (sx, sy, sw, sh) => {
    context.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
  }, crop)

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height)
  const upright = readCandidate(imageData, false, crop.confidence)
  const reversed = readCandidate(imageData, true, crop.confidence)

  if (upright && reversed) return upright.confidence >= reversed.confidence ? upright : reversed
  return upright || reversed
}

export async function detectTarotVisionMarkFromBlob(blob: Blob): Promise<TarotVisionDetection | null> {
  const { canvas, context } = createMarkerCanvas()

  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(blob)
    try {
      context.clearRect(0, 0, canvas.width, canvas.height)
      drawCropToTarget(bitmap.width, bitmap.height, context, (sx, sy, sw, sh) => {
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
          context.clearRect(0, 0, canvas.width, canvas.height)
          drawCropToTarget(image.naturalWidth, image.naturalHeight, context, (sx, sy, sw, sh) => {
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
