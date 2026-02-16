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

interface PlaceholderMetadata {
  placeholder?: boolean
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
  const [status, setStatus] = useState<RecognitionStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [lastResult, setLastResult] = useState<RecognitionResult | null>(null)
  const [modelLabels, setModelLabels] = useState<string[]>([])
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
        setLocalStats({ records: 0, cards: 0, candidates: 0, failedSamples: 0 })
        localMatcherRef.current = null
        return
      }

      setStatus('loading')
      setError(null)
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

      const isPlaceholderModel = async () => {
        try {
          const response = await fetch(metadataUrl)
          if (!response.ok) return false
          const metadata = (await response.json()) as PlaceholderMetadata
          return Boolean(metadata.placeholder)
        } catch {
          return false
        }
      }

      try {
        if (await isPlaceholderModel()) {
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

        await recognizerRef.current.load(modelUrl, metadataUrl)
        if (isMounted) {
          setModelLabels(recognizerRef.current.getLabels())
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
  }, [cards, enabled, metadataUrl, modelUrl])

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
          const prediction = localMatcherRef.current.predict(video)
          if (!prediction) return
          const verySmallLocalBase = localStats.cards <= 2
          const localThreshold = verySmallLocalBase
            ? 0.08
            : Math.min(confidenceThreshold, 0.34)
          if (prediction.confidence < localThreshold) return

          const card = cardLookup.get(`${prediction.cardId}`) || null
          if (!card) return

          const localVotes = verySmallLocalBase ? 1 : Math.max(2, minVotes - 1)
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
    localDiagnostics: localStats,
  }
}
