import { dbService } from './dbService'

const SIGNATURE_WIDTH = 24
const SIGNATURE_HEIGHT = 36
const TARGET_RATIO = 2 / 3

interface LocalCaptureCandidate {
  cardId: number
  isReversed: boolean
  signature: Float32Array
  samples: number
}

export interface LocalCaptureMatcherStats {
  cards: number
  candidates: number
}

export interface LocalCapturePrediction {
  cardId: number
  isReversed: boolean
  confidence: number
  label: string
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

const computeMeanSignature = (signatures: Float32Array[]) => {
  const base = signatures[0]
  const mean = new Float32Array(base.length)

  signatures.forEach(signature => {
    for (let i = 0; i < signature.length; i += 1) {
      mean[i] += signature[i]
    }
  })

  for (let i = 0; i < mean.length; i += 1) {
    mean[i] /= signatures.length
  }

  return mean
}

const meanAbsoluteDistance = (a: Float32Array, b: Float32Array) => {
  const size = Math.min(a.length, b.length)
  if (size === 0) return Number.POSITIVE_INFINITY

  let total = 0
  for (let i = 0; i < size; i += 1) {
    total += Math.abs(a[i] - b[i])
  }

  return total / size
}

const normalizeSignature = (values: Float32Array) => {
  const normalized = new Float32Array(values.length)
  let mean = 0

  for (let i = 0; i < values.length; i += 1) {
    mean += values[i]
  }
  mean /= values.length

  let variance = 0
  for (let i = 0; i < values.length; i += 1) {
    const centered = values[i] - mean
    variance += centered * centered
  }

  const stddev = Math.sqrt(variance / values.length) || 1

  for (let i = 0; i < values.length; i += 1) {
    normalized[i] = (values[i] - mean) / stddev
  }

  return normalized
}

const computeSignatureFromImageData = (imageData: ImageData) => {
  const data = imageData.data
  const values = new Float32Array(SIGNATURE_WIDTH * SIGNATURE_HEIGHT)

  for (let pixel = 0; pixel < values.length; pixel += 1) {
    const offset = pixel * 4
    const r = data[offset]
    const g = data[offset + 1]
    const b = data[offset + 2]
    values[pixel] = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  }

  return normalizeSignature(values)
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

const createWorkingCanvas = () => {
  const canvas = document.createElement('canvas')
  canvas.width = SIGNATURE_WIDTH
  canvas.height = SIGNATURE_HEIGHT
  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Não foi possível inicializar canvas para reconhecimento local.')
  }

  return { canvas, context }
}

export class LocalCaptureMatcher {
  private candidates: LocalCaptureCandidate[] = []
  private workingCanvas: HTMLCanvasElement | null = null
  private workingContext: CanvasRenderingContext2D | null = null

  private getCanvas() {
    if (this.workingCanvas && this.workingContext) {
      return {
        canvas: this.workingCanvas,
        context: this.workingContext,
      }
    }

    const { canvas, context } = createWorkingCanvas()
    this.workingCanvas = canvas
    this.workingContext = context
    return { canvas, context }
  }

  private async signatureFromBlob(blob: Blob) {
    const bitmap = await createImageBitmap(blob)
    const { canvas, context } = this.getCanvas()
    context.clearRect(0, 0, canvas.width, canvas.height)

    drawCoverCrop(bitmap.width, bitmap.height, (sx, sy, sw, sh) => {
      context.drawImage(bitmap, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
    })

    bitmap.close()
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height)
    return computeSignatureFromImageData(imageData)
  }

  private signatureFromVideo(video: HTMLVideoElement) {
    if (video.videoWidth <= 0 || video.videoHeight <= 0) return null

    const { canvas, context } = this.getCanvas()
    context.clearRect(0, 0, canvas.width, canvas.height)

    drawCoverCrop(video.videoWidth, video.videoHeight, (sx, sy, sw, sh) => {
      context.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
    })

    const imageData = context.getImageData(0, 0, canvas.width, canvas.height)
    return computeSignatureFromImageData(imageData)
  }

  private async loadOrientationCandidate(
    cardId: number,
    blobs: Blob[],
    isReversed: boolean,
  ) {
    if (!blobs.length) return null

    const signatures: Float32Array[] = []
    for (const blob of blobs.slice(0, 10)) {
      try {
        const signature = await this.signatureFromBlob(blob)
        signatures.push(signature)
      } catch (error) {
        console.error('Falha ao processar captura local:', error)
      }
    }

    if (!signatures.length) return null

    return {
      cardId,
      isReversed,
      signature: computeMeanSignature(signatures),
      samples: signatures.length,
    } satisfies LocalCaptureCandidate
  }

  async load(): Promise<LocalCaptureMatcherStats> {
    await dbService.init()
    const records = await dbService.getAllCardCaptures()
    const nextCandidates: LocalCaptureCandidate[] = []
    let cardsWithCaptures = 0

    for (const record of records) {
      const verticalCandidate = await this.loadOrientationCandidate(
        record.cardId,
        record.vertical.map(item => item.blob),
        false,
      )
      const reversedCandidate = await this.loadOrientationCandidate(
        record.cardId,
        record.invertido.map(item => item.blob),
        true,
      )

      if (verticalCandidate || reversedCandidate) {
        cardsWithCaptures += 1
      }

      if (verticalCandidate) {
        nextCandidates.push(verticalCandidate)
      }
      if (reversedCandidate) {
        nextCandidates.push(reversedCandidate)
      }
    }

    this.candidates = nextCandidates

    return {
      cards: cardsWithCaptures,
      candidates: nextCandidates.length,
    }
  }

  hasCandidates() {
    return this.candidates.length > 0
  }

  getStats(): LocalCaptureMatcherStats {
    const uniqueCards = new Set(this.candidates.map(candidate => candidate.cardId))
    return {
      cards: uniqueCards.size,
      candidates: this.candidates.length,
    }
  }

  predict(video: HTMLVideoElement): LocalCapturePrediction | null {
    if (!this.candidates.length) return null

    const frameSignature = this.signatureFromVideo(video)
    if (!frameSignature) return null

    const ranked = this.candidates
      .map(candidate => ({
        candidate,
        distance: meanAbsoluteDistance(frameSignature, candidate.signature),
      }))
      .sort((a, b) => a.distance - b.distance)

    const best = ranked[0]
    if (!best) return null

    const second = ranked[1]
    const similarity = clamp(1 - best.distance / 1.5, 0, 1)
    const margin = second
      ? clamp((second.distance - best.distance) / 0.5, 0, 1)
      : 0.5
    const confidence = clamp(similarity * 0.72 + margin * 0.28, 0, 1)

    return {
      cardId: best.candidate.cardId,
      isReversed: best.candidate.isReversed,
      confidence,
      label: `local-card-${best.candidate.cardId}-${
        best.candidate.isReversed ? 'invertido' : 'vertical'
      }`,
    }
  }
}
