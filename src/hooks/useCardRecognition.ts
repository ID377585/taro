import { RefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Card, RecognitionResult } from '../types'
import { CardRecognizerModel } from '../services/modelService'
import {
  LocalCaptureMatcher,
  LocalCaptureMatcherStats,
} from '../services/localCaptureMatcher'
import {
  createCardLookup,
  matchCardFromModelLabel,
  normalizeLabelValue,
} from '../services/labelService'

interface UseCardRecognitionOptions {
  videoRef: RefObject<HTMLVideoElement>
  cards: Card[]
  enabled: boolean
  modelUrl?: string
  metadataUrl?: string
  intervalMs?: number
  confidenceThreshold?: number
  minVotes?: number
  onConfirmed?: (result: RecognitionResult) => void
}

interface LabelDiagnostics {
  totalLabels: number
  mappedLabels: number
  unmappedLabels: string[]
}

export interface ModelDiagnostics {
  checked: boolean
  placeholder: boolean
  format: string | null
  labelsCount: number
  outputClasses: number | null
  expectedClasses: number
  warnings: string[]
}

export type RecognitionStatus =
  | 'idle'
  | 'loading'
  | 'running'
  | 'running-local'
  | 'no-model'
  | 'error'

interface VoteState {
  key: string
  count: number
}

interface ModelMetadataLike {
  placeholder?: boolean
  labels?: unknown
  classes?: unknown
  classNames?: unknown
  wordLabels?: unknown
  modelSettings?: {
    labels?: unknown
  }
  tfjsMetadata?: {
    labels?: unknown
  }
}

interface ModelInspectionResult {
  diagnostics: ModelDiagnostics
  labels: string[]
  fatalError: string | null
}

const createInitialModelDiagnostics = (expectedClasses: number): ModelDiagnostics => ({
  checked: false,
  placeholder: false,
  format: null,
  labelsCount: 0,
  outputClasses: null,
  expectedClasses,
  warnings: [],
})

const extractLabelsFromMetadata = (metadata: ModelMetadataLike | null): string[] => {
  if (!metadata) return []

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

const extractOutputClassesFromModelJson = (modelJson: unknown): number | null => {
  if (!modelJson || typeof modelJson !== 'object') return null

  const typedModel = modelJson as {
    modelTopology?: {
      config?: {
        layers?: Array<{
          class_name?: string
          config?: {
            units?: number
          }
        }>
      }
    }
    weightsManifest?: Array<{
      weights?: Array<{
        name?: string
        shape?: number[]
      }>
    }>
  }

  const layers = typedModel.modelTopology?.config?.layers
  if (Array.isArray(layers)) {
    for (let index = layers.length - 1; index >= 0; index -= 1) {
      const units = Number(layers[index]?.config?.units)
      if (Number.isFinite(units) && units > 0) {
        return units
      }
    }
  }

  const manifests = typedModel.weightsManifest
  if (Array.isArray(manifests)) {
    for (const manifest of manifests) {
      const weights = manifest.weights
      if (!Array.isArray(weights)) continue

      for (const weight of weights) {
        const shape = weight.shape
        if (!Array.isArray(shape) || shape.length !== 1) continue
        if (!weight.name?.toLowerCase().includes('/bias')) continue

        const units = Number(shape[0])
        if (Number.isFinite(units) && units > 0) {
          return units
        }
      }
    }
  }

  return null
}

const inspectModelArtifacts = async (
  modelUrl: string,
  metadataUrl: string,
  expectedClasses: number,
): Promise<ModelInspectionResult> => {
  let metadata: ModelMetadataLike | null = null

  try {
    const response = await fetch(metadataUrl)
    if (!response.ok) {
      return {
        diagnostics: {
          ...createInitialModelDiagnostics(expectedClasses),
          checked: true,
        },
        labels: [],
        fatalError: `metadata.json não encontrado (${response.status}).`,
      }
    }
    metadata = (await response.json()) as ModelMetadataLike
  } catch {
    return {
      diagnostics: {
        ...createInitialModelDiagnostics(expectedClasses),
        checked: true,
      },
      labels: [],
      fatalError: 'Falha ao ler metadata.json do modelo.',
    }
  }

  let rawModel: unknown
  try {
    const response = await fetch(modelUrl)
    if (!response.ok) {
      return {
        diagnostics: {
          ...createInitialModelDiagnostics(expectedClasses),
          checked: true,
          placeholder: Boolean(metadata?.placeholder),
          labelsCount: extractLabelsFromMetadata(metadata).length,
        },
        labels: extractLabelsFromMetadata(metadata),
        fatalError: `model.json não encontrado (${response.status}).`,
      }
    }
    rawModel = await response.json()
  } catch {
    return {
      diagnostics: {
        ...createInitialModelDiagnostics(expectedClasses),
        checked: true,
        placeholder: Boolean(metadata?.placeholder),
        labelsCount: extractLabelsFromMetadata(metadata).length,
      },
      labels: extractLabelsFromMetadata(metadata),
      fatalError: 'Falha ao ler model.json do modelo.',
    }
  }

  const labels = extractLabelsFromMetadata(metadata)
  const modelFormat =
    typeof (rawModel as { format?: unknown }).format === 'string'
      ? ((rawModel as { format?: string }).format ?? null)
      : null
  const outputClasses = extractOutputClassesFromModelJson(rawModel)
  const warnings: string[] = []

  if (!labels.length) {
    warnings.push('metadata.json sem labels válidas para mapeamento.')
  }

  if (outputClasses && labels.length > 0 && outputClasses !== labels.length) {
    warnings.push(
      `Classes do modelo (${outputClasses}) divergentes das labels (${labels.length}).`,
    )
  }

  const classesForComparison = labels.length || outputClasses || 0
  if (classesForComparison > 0 && classesForComparison !== expectedClasses) {
    warnings.push(
      `Quantidade recomendada para este app: ${expectedClasses} classes (carta + orientação). Atual: ${classesForComparison}.`,
    )
  }

  const diagnostics: ModelDiagnostics = {
    checked: true,
    placeholder: Boolean(metadata?.placeholder),
    format: modelFormat,
    labelsCount: labels.length,
    outputClasses,
    expectedClasses,
    warnings,
  }

  if (modelFormat !== 'layers-model') {
    return {
      diagnostics,
      labels,
      fatalError: `Formato inválido em model.json: esperado "layers-model", recebido "${modelFormat || 'desconhecido'}".`,
    }
  }

  if (!outputClasses) {
    return {
      diagnostics,
      labels,
      fatalError: 'Não foi possível identificar a quantidade de classes no model.json.',
    }
  }

  return {
    diagnostics,
    labels,
    fatalError: null,
  }
}

export const useCardRecognition = ({
  videoRef,
  cards,
  enabled,
  modelUrl = '/model/model.json',
  metadataUrl = '/model/metadata.json',
  intervalMs = 300,
  confidenceThreshold = 0.84,
  minVotes = 3,
  onConfirmed,
}: UseCardRecognitionOptions) => {
  const expectedClasses = cards.length * 2
  const [status, setStatus] = useState<RecognitionStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [lastResult, setLastResult] = useState<RecognitionResult | null>(null)
  const [modelLabels, setModelLabels] = useState<string[]>([])
  const [modelDiagnostics, setModelDiagnostics] = useState<ModelDiagnostics>(() =>
    createInitialModelDiagnostics(expectedClasses),
  )
  const [localStats, setLocalStats] = useState<LocalCaptureMatcherStats>({
    records: 0,
    cards: 0,
    candidates: 0,
    failedSamples: 0,
  })
  const recognizerRef = useRef<CardRecognizerModel | null>(null)
  const localMatcherRef = useRef<LocalCaptureMatcher | null>(null)
  const votesRef = useRef<VoteState | null>(null)
  const lastConfirmedKeyRef = useRef<string>('')
  const isPredictingRef = useRef(false)

  const cardLookup = useMemo(() => createCardLookup(cards), [cards])

  const labelMappings = useMemo(() => {
    const byNormalizedLabel = new Map<
      string,
      { card: Card; isReversed: boolean; originalLabel: string }
    >()
    const unmappedLabels: string[] = []

    modelLabels.forEach(label => {
      const matched = matchCardFromModelLabel(label, cardLookup)
      if (!matched.card) {
        unmappedLabels.push(label)
        return
      }

      byNormalizedLabel.set(matched.normalizedLabel, {
        card: matched.card,
        isReversed: matched.orientation === 'invertido',
        originalLabel: label,
      })
    })

    return {
      byNormalizedLabel,
      diagnostics: {
        totalLabels: modelLabels.length,
        mappedLabels: byNormalizedLabel.size,
        unmappedLabels: unmappedLabels.slice(0, 8),
      } satisfies LabelDiagnostics,
    }
  }, [cardLookup, modelLabels])

  useEffect(() => {
    let isMounted = true

    const loadModel = async () => {
      if (!enabled) {
        setStatus('idle')
        setError(null)
        setModelLabels([])
        setModelDiagnostics(createInitialModelDiagnostics(expectedClasses))
        setLocalStats({ records: 0, cards: 0, candidates: 0, failedSamples: 0 })
        localMatcherRef.current = null
        return
      }

      setStatus('loading')
      setError(null)
      setModelLabels([])
      setModelDiagnostics(createInitialModelDiagnostics(expectedClasses))
      setLocalStats({ records: 0, cards: 0, candidates: 0, failedSamples: 0 })
      localMatcherRef.current = null

      if (!recognizerRef.current) {
        recognizerRef.current = new CardRecognizerModel()
      }

      const fallbackToLocalMatcher = async () => {
        const matcher = new LocalCaptureMatcher()
        const stats = await matcher.load(cards)
        if (isMounted) {
          setLocalStats(stats)
        }

        if (stats.candidates > 0) {
          localMatcherRef.current = matcher
          if (isMounted) {
            setModelLabels([])
            setStatus('running-local')
            setError(null)
          }
          return {
            enabled: true,
            reason: '',
          }
        }

        if (stats.records > 0 && stats.failedSamples > 0) {
          return {
            enabled: false,
            reason: `Capturas locais encontradas (${stats.records} carta(s)), mas falharam na leitura de ${stats.failedSamples} amostra(s).`,
          }
        }
        if (stats.records > 0) {
          return {
            enabled: false,
            reason: `Capturas locais encontradas (${stats.records} carta(s)), porém sem variações utilizáveis para reconhecimento.`,
          }
        }

        return {
          enabled: false,
          reason: '',
        }
      }

      try {
        const inspection = await inspectModelArtifacts(
          modelUrl,
          metadataUrl,
          expectedClasses,
        )
        if (isMounted) {
          setModelDiagnostics(inspection.diagnostics)
        }

        if (inspection.diagnostics.placeholder) {
          const localFallback = await fallbackToLocalMatcher()
          if (!localFallback.enabled && isMounted) {
            setStatus('no-model')
            setError(
              localFallback.reason ||
                'Modelo base detectado. Para reconhecimento por IA, substitua os arquivos em public/model por um modelo treinado.',
            )
          }
          return
        }

        if (inspection.fatalError) {
          const localFallback = await fallbackToLocalMatcher()
          if (!localFallback.enabled && isMounted) {
            const isMissingArtifacts =
              inspection.fatalError.includes('não encontrado') ||
              inspection.fatalError.includes('404')
            setStatus(isMissingArtifacts ? 'no-model' : 'error')
            setError(localFallback.reason || inspection.fatalError)
          }
          return
        }

        await recognizerRef.current.load(modelUrl, metadataUrl)
        if (isMounted) {
          const loadedLabels = recognizerRef.current.getLabels()
          const nextLabels = loadedLabels.length ? loadedLabels : inspection.labels
          setModelLabels(nextLabels)
          setModelDiagnostics(prev => ({
            ...prev,
            labelsCount: nextLabels.length || prev.labelsCount,
          }))
          setStatus('running')
          setError(null)
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        try {
          const localFallback = await fallbackToLocalMatcher()
          if (!localFallback.enabled && isMounted) {
            if (message.toLowerCase().includes('404')) {
              setStatus('no-model')
              setError(
                localFallback.reason ||
                  'Modelo não encontrado e nenhuma captura local disponível para reconhecimento.',
              )
            } else {
              setStatus('error')
              setError(localFallback.reason || message)
            }
          }
        } catch (localError) {
          const fallbackMessage =
            localError instanceof Error ? localError.message : String(localError)
          if (isMounted) {
            setStatus('error')
            setError(
              `${message}. Além disso, falhou ao carregar capturas locais: ${fallbackMessage}`,
            )
          }
        }
      }
    }

    void loadModel()

    return () => {
      isMounted = false
    }
  }, [cards, enabled, expectedClasses, metadataUrl, modelUrl])

  useEffect(() => {
    if (!enabled || (status !== 'running' && status !== 'running-local')) return

    const timer = window.setInterval(() => {
      if (isPredictingRef.current) return

      const video = videoRef.current
      if (!video) return

      const handleResult = (
        result: RecognitionResult | null,
        requiredVotes: number,
      ) => {
        if (!result?.card) return

        const voteKey = `${result.card.id}:${result.isReversed ? 'r' : 'v'}`
        const currentVote = votesRef.current
        if (!currentVote || currentVote.key !== voteKey) {
          votesRef.current = { key: voteKey, count: 1 }
          return
        }

        votesRef.current = { key: voteKey, count: currentVote.count + 1 }
        if (votesRef.current.count < requiredVotes) return

        if (lastConfirmedKeyRef.current === voteKey) return
        lastConfirmedKeyRef.current = voteKey

        setLastResult(result)
        onConfirmed?.(result)
      }

      isPredictingRef.current = true

      if (status === 'running' && recognizerRef.current) {
        void recognizerRef.current
          .predict(video)
          .then(prediction => {
            if (!prediction) return
            if (prediction.confidence < confidenceThreshold) return

            const normalizedLabel = normalizeLabelValue(prediction.label)

            const mappedByLabel = labelMappings.byNormalizedLabel.get(normalizedLabel)
            const matched = matchCardFromModelLabel(prediction.label, cardLookup)
            const card =
              mappedByLabel?.card ||
              matched.card ||
              cardLookup.get(`${prediction.index}`) ||
              null

            const isReversed =
              mappedByLabel?.isReversed ?? matched.orientation === 'invertido'

            if (!card) return

            handleResult({
              card,
              isReversed,
              confidence: prediction.confidence,
              label: prediction.label,
            }, minVotes)
          })
          .finally(() => {
            isPredictingRef.current = false
          })
        return
      }

      if (status === 'running-local' && localMatcherRef.current) {
        try {
          const catalogOnlyFallback = localStats.records === 0 && localStats.cards > 0
          if (catalogOnlyFallback) return

          const prediction = localMatcherRef.current.predict(video)
          if (!prediction) return
          const verySmallLocalBase = localStats.cards <= 2
          const localThreshold = verySmallLocalBase
            ? Math.max(0.2, Math.min(confidenceThreshold, 0.45))
            : Math.max(0.52, Math.min(confidenceThreshold, 0.68))
          if (prediction.confidence < localThreshold) return

          const card = cardLookup.get(`${prediction.cardId}`) || null
          if (!card) return

          const localVotes = verySmallLocalBase
            ? Math.max(2, minVotes)
            : Math.max(4, minVotes + 1)
          handleResult({
            card,
            isReversed: prediction.isReversed,
            confidence: prediction.confidence,
            label: prediction.label,
          }, localVotes)
        } finally {
          isPredictingRef.current = false
        }
        return
      }

      isPredictingRef.current = false
    }, intervalMs)

    return () => {
      window.clearInterval(timer)
    }
  }, [
    enabled,
    status,
    videoRef,
    cardLookup,
    confidenceThreshold,
    intervalMs,
    minVotes,
    onConfirmed,
    labelMappings.byNormalizedLabel,
    localStats.records,
    localStats.cards,
    localStats.candidates,
  ])

  const resetLastConfirmation = useCallback(() => {
    lastConfirmedKeyRef.current = ''
    votesRef.current = null
    setLastResult(null)
  }, [])

  return {
    status,
    error,
    lastResult,
    resetLastConfirmation,
    labelDiagnostics: labelMappings.diagnostics,
    modelDiagnostics,
    localDiagnostics: localStats,
  }
}
