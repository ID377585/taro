import * as tf from '@tensorflow/tfjs'
import '@tensorflow/tfjs-backend-webgl'

interface ModelMetadata {
  labels?: string[]
  classes?: string[]
  classNames?: string[]
  wordLabels?: string[]
  modelSettings?: {
    labels?: string[]
  }
  tfjsMetadata?: {
    labels?: string[]
  }
}

export interface Prediction {
  index: number
  label: string
  confidence: number
  scores: number[]
}

let backendReady: Promise<void> | null = null

const ensureBackendReady = async () => {
  if (!backendReady) {
    backendReady = (async () => {
      try {
        await tf.setBackend('webgl')
      } catch {
        await tf.setBackend('cpu')
      }
      await tf.ready()
    })()
  }

  return backendReady
}

export class CardRecognizerModel {
  private model: tf.LayersModel | null = null
  private labels: string[] = []

  private extractLabelsFromMetadata(metadata: ModelMetadata) {
    const candidates: unknown[] = [
      metadata.labels,
      metadata.classNames,
      metadata.classes,
      metadata.wordLabels,
      metadata.modelSettings?.labels,
      metadata.tfjsMetadata?.labels,
    ]

    for (const candidate of candidates) {
      if (Array.isArray(candidate) && candidate.every(item => typeof item === 'string')) {
        return candidate as string[]
      }
    }

    return []
  }

  async load(modelUrl: string, metadataUrl?: string) {
    await ensureBackendReady()
    this.model = await tf.loadLayersModel(modelUrl)

    if (metadataUrl) {
      try {
        const metadata = (await fetch(metadataUrl).then(res =>
          res.json(),
        )) as ModelMetadata
        this.labels = this.extractLabelsFromMetadata(metadata)
      } catch {
        this.labels = []
      }
    }
  }

  isLoaded() {
    return Boolean(this.model)
  }

  getLabels() {
    return this.labels
  }

  async predict(videoElement: HTMLVideoElement): Promise<Prediction | null> {
    if (!this.model) return null
    if (videoElement.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return null

    const [, expectedHeight = 224, expectedWidth = 224] = this.model.inputs[0]
      .shape || [null, 224, 224]

    const logits = tf.tidy(() => {
      const frame = tf.browser
        .fromPixels(videoElement)
        .resizeBilinear([Number(expectedHeight), Number(expectedWidth)])
        .toFloat()
        .div(tf.scalar(255))
        .expandDims(0)

      return this.model!.predict(frame) as tf.Tensor
    })

    const scores = Array.from(await logits.data())
    logits.dispose()

    if (!scores.length) return null

    let bestIndex = 0
    let bestScore = scores[0]
    for (let i = 1; i < scores.length; i += 1) {
      if (scores[i] > bestScore) {
        bestScore = scores[i]
        bestIndex = i
      }
    }

    return {
      index: bestIndex,
      label: this.labels[bestIndex] ?? `${bestIndex}`,
      confidence: bestScore,
      scores,
    }
  }
}
