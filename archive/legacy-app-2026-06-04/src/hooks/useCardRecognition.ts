import { RefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Card, RecognitionResult } from '../types'
import { LocalCaptureMatcherStats } from '../services/localCaptureMatcher'
import { createCardLookup } from '../services/labelService'
import { detectTarotVisionMarkFromVideo } from '../services/detectCardFromImage'
import { matchOfficialDeckFromVideo, preloadOfficialDeckTemplates } from '../services/officialDeckMatcher'

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
  | 'running-marker'
  | 'no-model'
  | 'error'

interface VoteState {
  key: string
  count: number
}

const MARKER_USABLE_CONFIDENCE = 0.48
const MARKER_DIRECT_CONFIDENCE = 0.66
const MARKER_FAST_CONFIDENCE = 0.72
const TEMPLATE_PREFERS_OVER_MARKER_CONFIDENCE = 0.56
const TEMPLATE_PREFERS_OVER_MARKER_MARGIN = 0.05

const createInitialModelDiagnostics = (expectedClasses: number): ModelDiagnostics => ({
  checked: false,
  placeholder: false,
  format: null,
  labelsCount: 0,
  outputClasses: null,
  expectedClasses,
  warnings: [],
})

export const useCardRecognition = ({
  videoRef,
  cards,
  enabled,
  intervalMs = 160,
  minVotes = 2,
  onConfirmed,
}: UseCardRecognitionOptions) => {
  const cardsKey = useMemo(() => cards.map(card => `${card.id}:${card.imagemUrl}`).join('|'), [cards])
  const cardsCount = cards.length
  const expectedClasses = cardsCount
  const [status, setStatus] = useState<RecognitionStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [lastResult, setLastResult] = useState<RecognitionResult | null>(null)
  const [modelDiagnostics, setModelDiagnostics] = useState<ModelDiagnostics>(() =>
    createInitialModelDiagnostics(expectedClasses),
  )
  const [localStats, setLocalStats] = useState<LocalCaptureMatcherStats>({
    records: 0,
    cards: 0,
    candidates: 0,
    failedSamples: 0,
  })

  const votesRef = useRef<VoteState | null>(null)
  const lastConfirmedKeyRef = useRef<string>('')
  const isPredictingRef = useRef(false)
  const cardsRef = useRef(cards)
  const cardLookupRef = useRef(createCardLookup(cards))

  const labelDiagnostics = useMemo<LabelDiagnostics>(() => ({
    totalLabels: 0,
    mappedLabels: 0,
    unmappedLabels: [],
  }), [])

  useEffect(() => {
    cardsRef.current = cards
    cardLookupRef.current = createCardLookup(cards)
  }, [cards])

  useEffect(() => {
    if (!enabled) {
      setStatus('idle')
      setError(null)
      setLastResult(null)
      setModelDiagnostics(createInitialModelDiagnostics(expectedClasses))
      setLocalStats({ records: 0, cards: 0, candidates: 0, failedSamples: 0 })
      votesRef.current = null
      lastConfirmedKeyRef.current = ''
      return
    }

    const currentCards = cardsRef.current
    setStatus('running-marker')
    setError(null)
    setLastResult(null)
    setModelDiagnostics({
      checked: true,
      placeholder: false,
      format: 'tarot-vision-mark-plus-official-deck-template',
      labelsCount: currentCards.length,
      outputClasses: currentCards.length,
      expectedClasses,
      warnings: [
        'Modelo antigo e capturas locais desativados.',
        'Leitura principal por Tarot Vision Mark; fallback determinístico pelo baralho oficial dourado.',
      ],
    })
    setLocalStats({ records: 0, cards: currentCards.length, candidates: 0, failedSamples: 0 })
    preloadOfficialDeckTemplates(currentCards)
    votesRef.current = null
    lastConfirmedKeyRef.current = ''
  }, [cardsKey, cardsCount, enabled, expectedClasses])

  useEffect(() => {
    if (!enabled || status !== 'running-marker') return

    const timer = window.setInterval(async () => {
      if (isPredictingRef.current) return

      const video = videoRef.current
      if (!video) return

      isPredictingRef.current = true

      try {
        const confirmResult = (result: RecognitionResult, requiredVotes: number) => {
          if (!result.card) return

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

        const currentCards = cardsRef.current
        const currentCardLookup = cardLookupRef.current
        const markerPrediction = detectTarotVisionMarkFromVideo(video)
        const markerIsUsable = Boolean(markerPrediction && markerPrediction.confidence >= MARKER_USABLE_CONFIDENCE)
        const markerIsDirect = Boolean(markerPrediction && markerPrediction.confidence >= MARKER_DIRECT_CONFIDENCE)
        const markerIsFast = Boolean(markerPrediction && markerPrediction.confidence >= MARKER_FAST_CONFIDENCE)

        if (markerPrediction && markerIsDirect) {
          const card = currentCardLookup.get(`${markerPrediction.cardId}`) || null
          if (card) {
            confirmResult(
              {
                card,
                isReversed: markerPrediction.isReversed,
                confidence: markerPrediction.confidence,
                label: `tarot-vision-mark-${markerPrediction.cardId}`,
              },
              markerIsFast ? Math.max(2, Math.min(minVotes, 2)) : Math.max(2, Math.min(minVotes + 1, 3)),
            )

            isPredictingRef.current = false
            return
          }
        }

        const templateMatch = await matchOfficialDeckFromVideo(video, currentCards)
        if (!templateMatch && !markerIsUsable) {
          isPredictingRef.current = false
          return
        }

        const shouldPreferTemplate =
          templateMatch &&
          (!markerPrediction ||
            !markerIsUsable ||
            (templateMatch.cardId !== markerPrediction.cardId &&
              (templateMatch.confidence >= TEMPLATE_PREFERS_OVER_MARKER_CONFIDENCE ||
                templateMatch.confidence > markerPrediction.confidence + TEMPLATE_PREFERS_OVER_MARKER_MARGIN)))
        const selectedCardId = shouldPreferTemplate ? templateMatch.cardId : markerPrediction?.cardId
        const card = selectedCardId !== undefined ? currentCardLookup.get(`${selectedCardId}`) || null : null
        if (!card) {
          isPredictingRef.current = false
          return
        }

        if (shouldPreferTemplate && templateMatch) {
          confirmResult(
            {
              card,
              isReversed: templateMatch.isReversed,
              confidence: templateMatch.confidence,
              label: `official-deck-template-${templateMatch.cardId}`,
            },
            Math.max(2, minVotes),
          )
        } else if (markerPrediction) {
          confirmResult(
            {
              card,
              isReversed: markerPrediction.isReversed,
              confidence: markerPrediction.confidence,
              label: `tarot-vision-mark-${markerPrediction.cardId}`,
            },
            Math.max(2, Math.min(minVotes + 1, 3)),
          )
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        setError(message)
      } finally {
        isPredictingRef.current = false
      }
    }, intervalMs)

    return () => {
      window.clearInterval(timer)
    }
  }, [cardsKey, enabled, status, videoRef, intervalMs, minVotes, onConfirmed])

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
    labelDiagnostics,
    modelDiagnostics,
    localDiagnostics: localStats,
  }
}
