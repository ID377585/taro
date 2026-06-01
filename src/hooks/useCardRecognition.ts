import { RefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Card, RecognitionResult } from '../types'
import { LocalCaptureMatcherStats } from '../services/localCaptureMatcher'
import { createCardLookup } from '../services/labelService'
import { detectTarotVisionMarkFromVideo } from '../services/detectCardFromImage'

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
      format: 'tarot-vision-mark-only',
      labelsCount: cards.length,
      outputClasses: cards.length,
      expectedClasses,
      warnings: ['Modelo antigo e capturas locais desativados. Leitura aceita somente por Tarot Vision Mark.'],
    })
    setLocalStats({ records: 0, cards: cards.length, candidates: 0, failedSamples: 0 })
    votesRef.current = null
    lastConfirmedKeyRef.current = ''
  }, [cards.length, enabled, expectedClasses])

  useEffect(() => {
    if (!enabled || status !== 'running-marker') return

    const timer = window.setInterval(() => {
      if (isPredictingRef.current) return

      const video = videoRef.current
      if (!video) return

      isPredictingRef.current = true

      try {
        const markerPrediction = detectTarotVisionMarkFromVideo(video)
        if (!markerPrediction || markerPrediction.confidence < 0.55) {
          isPredictingRef.current = false
          return
        }

        const card = cardLookup.get(`${markerPrediction.cardId}`) || null
        if (!card) {
          isPredictingRef.current = false
          return
        }

        const result: RecognitionResult = {
          card,
          isReversed: markerPrediction.isReversed,
          confidence: markerPrediction.confidence,
          label: `tarot-vision-mark-${markerPrediction.cardId}`,
        }

        const voteKey = `${card.id}:${markerPrediction.isReversed ? 'r' : 'v'}`
        const currentVote = votesRef.current
        if (!currentVote || currentVote.key !== voteKey) {
          votesRef.current = { key: voteKey, count: 1 }
          isPredictingRef.current = false
          return
        }

        const requiredVotes = Math.max(2, Math.min(minVotes, 3))
        votesRef.current = { key: voteKey, count: currentVote.count + 1 }
        if (votesRef.current.count < requiredVotes) {
          isPredictingRef.current = false
          return
        }

        if (lastConfirmedKeyRef.current === voteKey) {
          isPredictingRef.current = false
          return
        }

        lastConfirmedKeyRef.current = voteKey
        setLastResult(result)
        onConfirmed?.(result)
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
