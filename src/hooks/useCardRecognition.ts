import { RefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Card, RecognitionResult } from '../types'
import { LocalCaptureMatcherStats } from '../services/localCaptureMatcher'
import { createCardLookup } from '../services/labelService'
import { detectTarotVisionMarkFromVideo } from '../services/detectCardFromImage'
import { matchOfficialDeckFromVideo } from '../services/officialDeckMatcher'

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
  intervalMs = 300,
  minVotes = 3,
  onConfirmed,
}: UseCardRecognitionOptions) => {
  const expectedClasses = cards.length * 2
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
  const cardLookup = useMemo(() => createCardLookup(cards), [cards])

  const labelDiagnostics = useMemo<LabelDiagnostics>(() => ({
    totalLabels: 0,
    mappedLabels: 0,
    unmappedLabels: [],
  }), [])

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

    // MODO OFICIAL DO BARALHO:
    // O reconhecimento automático aceita somente Tarot Vision Mark.
    // Modelo antigo e capturas locais ficam desativados para evitar falsos positivos
    // como “O Louco” quando o marcador técnico não fecha.
    setStatus('running-marker')
    setError(null)
    setLastResult(null)
    setModelDiagnostics({
      checked: true,
      placeholder: false,
      format: 'tarot-vision-mark-plus-official-deck-template',
      labelsCount: cards.length,
      outputClasses: cards.length,
      expectedClasses,
      warnings: [
        'Modelo antigo e capturas locais desativados.',
        'Leitura principal por Tarot Vision Mark; fallback determinístico pelo baralho oficial dourado.',
      ],
    })
    setLocalStats({ records: 0, cards: cards.length, candidates: 0, failedSamples: 0 })
    votesRef.current = null
    lastConfirmedKeyRef.current = ''
  }, [cards.length, enabled, expectedClasses])

  useEffect(() => {
    if (!enabled || status !== 'running-marker') return

    const timer = window.setInterval(async () => {
      if (isPredictingRef.current) return

      const video = videoRef.current
      if (!video) return

      isPredictingRef.current = true

      try {
        const confirmResult = (result: RecognitionResult, requiredVotes: number) => {
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

        const markerPrediction = detectTarotVisionMarkFromVideo(video)
        if (markerPrediction && markerPrediction.confidence >= 0.55) {
          const card = cardLookup.get(`${markerPrediction.cardId}`) || null

          if (card) {
            confirmResult({
              card,
              isReversed: markerPrediction.isReversed,
              confidence: markerPrediction.confidence,
              label: `tarot-vision-mark-${markerPrediction.cardId}`,
            }, Math.max(2, Math.min(minVotes, 3)))

            isPredictingRef.current = false
            return
          }
        }

        const templateMatch = await matchOfficialDeckFromVideo(video, cards)
        if (!templateMatch) {
          isPredictingRef.current = false
          return
        }

        const card = cardLookup.get(`${templateMatch.cardId}`) || null
        if (!card) {
          isPredictingRef.current = false
          return
        }

        confirmResult({
          card,
          isReversed: false,
          confidence: templateMatch.confidence,
          label: `official-deck-template-${templateMatch.cardId}`,
        }, Math.max(2, minVotes))
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
  }, [enabled, status, videoRef, cardLookup, intervalMs, minVotes, onConfirmed])

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
