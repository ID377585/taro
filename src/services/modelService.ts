export interface ModelMetadata {
  labels?: string[]
  classes?: string[]
  classNames?: string[]
  wordLabels?: string[]
  placeholder?: boolean
  modelType?: string
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

export type ModelReadinessStatus = 'ready' | 'bootstrap' | 'incomplete' | 'unavailable'

export interface ModelReadinessDiagnostics {
  status: ModelReadinessStatus
  placeholder: boolean
  modelType: string | null
  labelsCount: number
  outputClasses: number | null
  expectedClasses: number
  message: string
  detail: string
}

interface ModelJsonLayer {
  config?: {
    units?: unknown
  }
}

interface ModelJson {
  format?: string
  modelTopology?: {
    config?: {
      layers?: ModelJsonLayer[]
    }
  }
}

type TfModule = typeof import('@tensorflow/tfjs')

let tfModulePromise: Promise<TfModule> | null = null
let backendReady: Promise<TfModule> | null = null

const loadTf = async (): Promise<TfModule> => {
  if (!tfModulePromise) {
    tfModulePromise = (async () => {
      const [tf] = await Promise.all([
        import('@tensorflow/tfjs'),
        import('@tensorflow/tfjs-backend-webgl'),
      ])
      return tf
    })()
  }

  return tfModulePromise
}

const ensureBackendReady = async (): Promise<TfModule> => {
  if (!backendReady) {
    backendReady = (async () => {
      const tf = await loadTf()
      try {
        await tf.setBackend('webgl')
      } catch {
        await tf.setBackend('cpu')
      }
      await tf.ready()
      return tf
    })()
  }

  return backendReady
}

export const extractLabelsFromMetadata = (metadata: ModelMetadata) => {
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

export const getModelOutputClasses = (modelJson: ModelJson) => {
  const layers = modelJson.modelTopology?.config?.layers
  if (!Array.isArray(layers)) return null

  for (let index = layers.length - 1; index >= 0; index -= 1) {
    const units = layers[index]?.config?.units
    if (Number.isInteger(units)) return units as number
  }

  return null
}

export const buildModelReadinessDiagnostics = (
  metadata: ModelMetadata,
  modelJson: ModelJson,
  expectedClasses = 156,
): ModelReadinessDiagnostics => {
  const labelsCount = extractLabelsFromMetadata(metadata).length
  const outputClasses = getModelOutputClasses(modelJson)
  const placeholder = metadata.placeholder === true
  const modelType = typeof metadata.modelType === 'string' ? metadata.modelType : null
  const hasExpectedShape = labelsCount === expectedClasses && outputClasses === expectedClasses

  if (!placeholder && hasExpectedShape && modelJson.format === 'layers-model') {
    return {
      status: 'ready',
      placeholder,
      modelType,
      labelsCount,
      outputClasses,
      expectedClasses,
      message: 'Modelo final pronto.',
      detail: `${labelsCount} labels e ${outputClasses} classes de saída publicados.`,
    }
  }

  if (placeholder) {
    return {
      status: 'bootstrap',
      placeholder,
      modelType,
      labelsCount,
      outputClasses,
      expectedClasses,
      message: 'Modelo bootstrap publicado.',
      detail: `Substitua public/model por um modelo final com ${expectedClasses} classes antes de depender da IA treinada.`,
    }
  }

  return {
    status: 'incomplete',
    placeholder,
    modelType,
    labelsCount,
    outputClasses,
    expectedClasses,
    message: 'Modelo incompleto ou inconsistente.',
    detail: `Esperado: ${expectedClasses} labels/classes. Atual: ${labelsCount} labels e ${String(outputClasses)} classes.`,
  }
}

export const inspectModelReadiness = async (
  metadataUrl = '/model/metadata.json',
  modelUrl = '/model/model.json',
  expectedClasses = 156,
): Promise<ModelReadinessDiagnostics> => {
  try {
    const [metadataResponse, modelResponse] = await Promise.all([
      fetch(metadataUrl),
      fetch(modelUrl),
    ])

    if (!metadataResponse.ok || !modelResponse.ok) {
      throw new Error(
        `HTTP metadata=${metadataResponse.status}, model=${modelResponse.status}`,
      )
    }

    const metadata = (await metadataResponse.json()) as ModelMetadata
    const modelJson = (await modelResponse.json()) as ModelJson
    return buildModelReadinessDiagnostics(metadata, modelJson, expectedClasses)
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Falha desconhecida.'
    return {
      status: 'unavailable',
      placeholder: false,
      modelType: null,
      labelsCount: 0,
      outputClasses: null,
      expectedClasses,
      message: 'Modelo indisponível.',
      detail,
    }
  }
}

export class CardRecognizerModel {
  private model: import('@tensorflow/tfjs').LayersModel | null = null
  private labels: string[] = []

  async load(modelUrl: string, metadataUrl?: string) {
    const tf = await ensureBackendReady()
    this.model = await tf.loadLayersModel(modelUrl)

    if (metadataUrl) {
      try {
        const metadata = (await fetch(metadataUrl).then(res =>
          res.json(),
        )) as ModelMetadata
        this.labels = extractLabelsFromMetadata(metadata)
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

    const tf = await ensureBackendReady()
    const [, expectedHeightRaw = 224, expectedWidthRaw = 224] =
      this.model.inputs[0].shape || [null, 224, 224]
    const expectedHeight = Number(expectedHeightRaw || 224)
    const expectedWidth = Number(expectedWidthRaw || 224)

    const logits = tf.tidy(() => {
      const frame = tf.browser
        .fromPixels(videoElement)
        .resizeBilinear([expectedHeight, expectedWidth])
        .toFloat()
        .div(tf.scalar(255))
        .expandDims(0)

      return this.model!.predict(frame) as import('@tensorflow/tfjs').Tensor
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
