import { RefObject, useEffect, useMemo, useRef, useState } from 'react'
import { Card, RecognitionResult } from '../types'
import { CardRecognizerModel } from '../services/modelService'
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
  | 'no-model'
  | 'error'

interface VoteState {
  key: string
  count: number
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
  const recognizerRef = useRef<CardRecognizerModel | null>(null)
  const votesRef = useRef<VoteState | null>(null)
  const lastConfirmedKeyRef = useRef<string>('')

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
        return
      }

      setStatus('loading')
      setError(null)

      if (!recognizerRef.current) {
        recognizerRef.current = new CardRecognizerModel()
      }

      try {
        await recognizerRef.current.load(modelUrl, metadataUrl)
        if (isMounted) {
          setModelLabels(recognizerRef.current.getLabels())
          setStatus('running')
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        if (message.toLowerCase().includes('404')) {
          if (isMounted) {
            setStatus('no-model')
            setError('Modelo não encontrado em /public/model.')
          }
        } else if (isMounted) {
          setStatus('error')
          setError(message)
        }
      }
    }

    void loadModel()

    return () => {
      isMounted = false
    }
  }, [enabled, metadataUrl, modelUrl])

  useEffect(() => {
    if (!enabled || status !== 'running') return

    const timer = window.setInterval(() => {
      const video = videoRef.current
      if (!video || !recognizerRef.current) return

      void recognizerRef.current.predict(video).then(prediction => {
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

        const voteKey = `${card.id}:${isReversed ? 'r' : 'v'}`
        const currentVote = votesRef.current
        if (!currentVote || currentVote.key !== voteKey) {
          votesRef.current = { key: voteKey, count: 1 }
          return
        }

        votesRef.current = { key: voteKey, count: currentVote.count + 1 }
        if (votesRef.current.count < minVotes) return

        if (lastConfirmedKeyRef.current === voteKey) return
        lastConfirmedKeyRef.current = voteKey

        const result: RecognitionResult = {
          card,
          isReversed,
          confidence: prediction.confidence,
          label: prediction.label,
        }

        setLastResult(result)
        onConfirmed?.(result)
      })
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
  ])

  const resetLastConfirmation = () => {
    lastConfirmedKeyRef.current = ''
    votesRef.current = null
    setLastResult(null)
  }

  return {
    status,
    error,
    lastResult,
    resetLastConfirmation,
    labelDiagnostics: labelMappings.diagnostics,
  }
}
