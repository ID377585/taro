import {
  ChangeEvent,
  CSSProperties,
  FC,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Card, DrawnCard, Spread, ConsultationIntake } from '../types'
import { CameraResolution, useCamera } from '../hooks/useCamera'
import { useCardRecognition } from '../hooks/useCardRecognition'
import { generateAdvancedSpreadSynthesis } from '../services/advancedReadingService'
import CameraView from './CameraView'
import CardRecognizer from './CardRecognizer'
import './TeleprompterView.css'

interface WakeLockSentinelLike {
  release: () => Promise<void>
}

type TextAlignMode = 'left' | 'center' | 'right'
type ResolutionPreset = 'high' | 'medium' | 'low'
type ShortcutAction =
  | 'togglePlay'
  | 'faster'
  | 'slower'
  | 'next'
  | 'previous'
  | 'fullscreen'
  | 'sync'

interface ShortcutConfig {
  togglePlay: string
  faster: string
  slower: string
  next: string
  previous: string
  fullscreen: string
  sync: string
}

interface TeleprompterSettings {
  wpm: number
  fontSize: number
  lineHeight: number
  fontFamily: string
  textColor: string
  backgroundColor: string
  maxTextWidth: number
  textAlign: TextAlignMode
  highVisibility: boolean
  flipHorizontal: boolean
  flipVertical: boolean
  highlightLine: boolean
  smoothAcceleration: boolean
  recognitionIntervalMs: number
  recognitionThreshold: number
  recognitionMinVotes: number
  resolutionPreset: ResolutionPreset
  renderScale: number
}

interface SpeechRecognitionAlternativeLike {
  transcript: string
}

interface SpeechRecognitionResultLike {
  0: SpeechRecognitionAlternativeLike
  isFinal: boolean
}

interface SpeechRecognitionEventLike extends Event {
  results: ArrayLike<SpeechRecognitionResultLike>
}

interface SpeechRecognitionLike {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: Event) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike

interface TeleprompterViewProps {
  spread: Spread
  cards: Card[]
  consultation: ConsultationIntake | null
  onBack: () => void
  onSaveSession: (drawnCards: DrawnCard[]) => Promise<void>
}

const SETTINGS_STORAGE_KEY = 'taro.teleprompter.settings.v2'
const SHORTCUT_STORAGE_KEY = 'taro.teleprompter.shortcuts.v1'
const DEFAULT_WPM = 89

const DEFAULT_SETTINGS: TeleprompterSettings = {
  wpm: DEFAULT_WPM,
  fontSize: 34,
  lineHeight: 1.55,
  fontFamily: '"Segoe UI", Tahoma, sans-serif',
  textColor: '#ffffff',
  backgroundColor: '#060606',
  maxTextWidth: 84,
  textAlign: 'left',
  highVisibility: false,
  flipHorizontal: false,
  flipVertical: false,
  highlightLine: true,
  smoothAcceleration: true,
  recognitionIntervalMs: 300,
  recognitionThreshold: 0.84,
  recognitionMinVotes: 3,
  resolutionPreset: 'high',
  renderScale: 1,
}

const DEFAULT_SHORTCUTS: ShortcutConfig = {
  togglePlay: 'Space',
  faster: 'ArrowUp',
  slower: 'ArrowDown',
  next: 'ArrowRight',
  previous: 'ArrowLeft',
  fullscreen: 'KeyF',
  sync: 'KeyS',
}

const RESOLUTION_PRESETS: Record<ResolutionPreset, CameraResolution> = {
  high: { width: 1280, height: 720 },
  medium: { width: 960, height: 540 },
  low: { width: 640, height: 480 },
}

const FONT_OPTIONS = [
  '"Segoe UI", Tahoma, sans-serif',
  '"Verdana", sans-serif',
  '"Trebuchet MS", sans-serif',
  '"Tahoma", sans-serif',
  '"Arial", sans-serif',
]

const normalizeText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()

const toUppercaseDisplay = (value: string) => value.toLocaleUpperCase('pt-BR')

const formatBirthDate = (raw?: string) => {
  if (!raw) return null
  const [year, month, day] = raw.split('-')
  if (!year || !month || !day) return raw
  return `${day}/${month}/${year}`
}

const formatSexLabel = (sex: 'masculino' | 'feminino') =>
  sex === 'feminino' ? 'FEMININO' : 'MASCULINO'

const formatConsultationPerson = (
  person: ConsultationIntake['pessoa1'] | ConsultationIntake['pessoa2'] | null | undefined,
  fallback: string,
) => {
  if (!person) return fallback
  const name = toUppercaseDisplay(person.nomeCompleto || fallback)
  const birthDate = formatBirthDate(person.dataNascimento)
  return `${name} (${formatSexLabel(person.sexo)}${birthDate ? `, NASC.: ${birthDate}` : ''})`
}

const formatTime = (seconds: number) => {
  const safe = Math.max(0, seconds)
  const minutes = Math.floor(safe / 60)
  const remainder = safe % 60
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
}

const formatShortcut = (shortcut: string) =>
  shortcut
    .replace(/^Key/, '')
    .replace(/^Digit/, '')
    .replace('ArrowUp', '↑')
    .replace('ArrowDown', '↓')
    .replace('ArrowLeft', '←')
    .replace('ArrowRight', '→')
    .replace('Space', 'Espaço')

const parseAnnotatedSegments = (paragraph: string) => {
  const segments: Array<{ type: 'text' | 'highlight' | 'note'; value: string }> = []
  const pattern = /\[\[(.+?)\]\]|\(\((.+?)\)\)/g
  let lastIndex = 0

  let match = pattern.exec(paragraph)
  while (match) {
    if (match.index > lastIndex) {
      segments.push({
        type: 'text',
        value: paragraph.slice(lastIndex, match.index),
      })
    }

    if (match[1]) {
      segments.push({ type: 'highlight', value: match[1] })
    } else if (match[2]) {
      segments.push({ type: 'note', value: match[2] })
    }

    lastIndex = pattern.lastIndex
    match = pattern.exec(paragraph)
  }

  if (lastIndex < paragraph.length) {
    segments.push({
      type: 'text',
      value: paragraph.slice(lastIndex),
    })
  }

  return segments
}

const formatArcanoLabel = (card: Card) =>
  card.arcano === 'maior' ? 'Arcano Maior' : 'Arcano Menor'

const formatNaipeElementLabel = (card: Card) => {
  if (!card.naipe || !card.elemento) return 'Elemento arquetípico'
  return `${card.naipe[0].toUpperCase()}${card.naipe.slice(1)} • ${card.elemento.nome}`
}

const TeleprompterView: FC<TeleprompterViewProps> = ({
  spread,
  cards,
  consultation,
  onBack,
  onSaveSession,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null)
  const wakeLockRef = useRef<WakeLockSentinelLike | null>(null)
  const scriptWindowRef = useRef<HTMLDivElement>(null)
  const paragraphRefs = useRef<Array<HTMLParagraphElement | null>>([])
  const scrollAnimationRef = useRef<number | null>(null)
  const lastFrameRef = useRef<number | null>(null)
  const speedPxRef = useRef(0)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const voiceRecognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const voiceEnabledRef = useRef(false)
  const previousResolutionPresetRef = useRef<ResolutionPreset>('high')
  const autoSynthesisKeyRef = useRef('')

  const [settings, setSettings] = useState<TeleprompterSettings>(DEFAULT_SETTINGS)
  const [shortcuts, setShortcuts] = useState<ShortcutConfig>(DEFAULT_SHORTCUTS)
  const [capturingShortcut, setCapturingShortcut] = useState<ShortcutAction | null>(null)
  const [showAdvancedPanel, setShowAdvancedPanel] = useState(false)
  const [isPanelExpanded, setIsPanelExpanded] = useState(false)
  const [isActionControlsExpanded, setIsActionControlsExpanded] = useState(false)
  const [isExtraControlsExpanded, setIsExtraControlsExpanded] = useState(false)
  const [controlFeedback, setControlFeedback] = useState('')
  const [synthesisText, setSynthesisText] = useState('')
  const [currentPositionIndex, setCurrentPositionIndex] = useState(0)
  const [drawnByPosition, setDrawnByPosition] = useState<Record<number, DrawnCard>>({})
  const [manualCardId, setManualCardId] = useState('')
  const [manualIsReversed, setManualIsReversed] = useState(false)
  const [recognitionEnabled, setRecognitionEnabled] = useState(true)
  const [autoAdvance, setAutoAdvance] = useState(true)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveFeedback, setSaveFeedback] = useState('')
  const [scriptMode, setScriptMode] = useState<'auto' | 'manual'>('auto')
  const [scriptText, setScriptText] = useState('')
  const [isScrolling, setIsScrolling] = useState(false)
  const [activeParagraphIndex, setActiveParagraphIndex] = useState(0)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [countdownMinutes, setCountdownMinutes] = useState(0)
  const [countdownRemainingSeconds, setCountdownRemainingSeconds] = useState(0)
  const [voiceStatus, setVoiceStatus] = useState<
    'idle' | 'listening' | 'unsupported' | 'error'
  >('idle')

  const selectedResolution = RESOLUTION_PRESETS[settings.resolutionPreset]

  const {
    devices,
    currentDeviceId,
    isActive,
    isStarting,
    error: cameraError,
    startCamera,
    switchCamera,
  } = useCamera(videoRef)

  const currentPosition = spread.positions[currentPositionIndex]
  const currentPositionNumber = currentPosition?.index ?? 1
  const currentDrawn = drawnByPosition[currentPositionNumber]
  const cardById = useMemo(() => new Map(cards.map(card => [card.id, card])), [cards])
  const currentCard = useMemo(
    () => cards.find(card => card.id === currentDrawn?.cardId) || null,
    [cards, currentDrawn],
  )
  const consultationSummary = useMemo(() => {
    if (!consultation) return null

    const pessoa1Context = formatConsultationPerson(consultation.pessoa1, 'PESSOA 1')
    if (consultation.tipo === 'pessoal') {
      return `ATENDIMENTO PESSOAL: ${pessoa1Context}`
    }

    const pessoa2Context = formatConsultationPerson(consultation.pessoa2, 'PESSOA 2')
    return `SOBRE OUTRA PESSOA: ${pessoa1Context} E ${pessoa2Context}`
  }, [consultation])

  const autoScript = useMemo(() => {
    if (!currentPosition) {
      return 'Selecione uma posição da tiragem.'
    }

    const consultationLines: string[] = []
    if (consultation) {
      const pessoa1Context = formatConsultationPerson(consultation.pessoa1, 'PESSOA 1')
      const situation = toUppercaseDisplay(consultation.situacaoPrincipal)
      if (consultation.tipo === 'pessoal') {
        const adjective = consultation.pessoa1.sexo === 'feminino' ? 'acolhida' : 'acolhido'
        consultationLines.push(
          `[[ATENDIMENTO PESSOAL]]`,
          `Cliente: ${pessoa1Context}`,
          `Situação principal: ${situation}`,
          `Condução sugerida: mantenha um tom claro e ${adjective}, com foco em passos concretos.`,
        )
      } else {
        const pessoa2Context = formatConsultationPerson(consultation.pessoa2, 'PESSOA 2')
        const pessoa1Pronome = consultation.pessoa1.sexo === 'feminino' ? 'ela' : 'ele'
        const pessoa2Pronome =
          consultation.pessoa2?.sexo === 'feminino' ? 'ela' : 'ele'
        consultationLines.push(
          `[[LEITURA SOBRE OUTRA PESSOA]]`,
          `Pessoa 1: ${pessoa1Context}`,
          `Pessoa 2: ${pessoa2Context}`,
          `Situação principal: ${situation}`,
          `Condução sugerida: explique a dinâmica entre as pessoas, validando como ${pessoa1Pronome} e ${pessoa2Pronome} contribuem para o cenário atual.`,
        )
      }
    }

    const orderedDrawnBlocks = spread.positions
      .map(position => {
        const drawn = drawnByPosition[position.index]
        if (!drawn) return null

        const card = cardById.get(drawn.cardId)
        if (!card) return null

        const orientationLabel = drawn.isReversed ? 'Invertida' : 'Vertical'
        const coreMeaning = drawn.isReversed
          ? card.significado.invertido.longo
          : card.significado.vertical.longo

        return [
          `[[Posição ${position.index}: ${position.nome}]]`,
          position.descricao,
          `Carta: [[${card.nome}]] (${orientationLabel})`,
          `Arcano: ${formatArcanoLabel(card)}.`,
          `Representação: ${card.representacao || 'Não informada.'}`,
          `Elemento: ${card.elemento ? `${card.elemento.nome} - ${card.elemento.descricao}` : 'Não aplicável para esta carta.'}`,
          `Numerologia: ${card.numerologia ? `${card.numerologia.valor} (${card.numerologia.titulo}) - ${card.numerologia.descricao}` : 'Sem dados numerológicos.'}`,
          `Luz: ${card.polaridades?.luz || card.significado.vertical.curto}`,
          `Sombra: ${card.polaridades?.sombra || card.significado.invertido.curto}`,
          `${card.corte ? `Carta da corte: ${card.corte.titulo} - ${card.corte.descricao}` : ''}`,
          coreMeaning,
          `Carreira: ${card.areas.carreira}`,
          `Relacionamentos: ${card.areas.relacionamentos}`,
          `Espiritual: ${card.areas.espiritual}`,
        ]
          .filter(Boolean)
          .join('\n\n')
      })
      .filter((block): block is string => Boolean(block))

    const nextPendingPosition = spread.positions.find(position => !drawnByPosition[position.index])
    const nextStepBlock = nextPendingPosition
      ? [
          `[[Próxima posição ${nextPendingPosition.index}: ${nextPendingPosition.nome}]]`,
          nextPendingPosition.descricao,
          'Aponte a carta para a câmera para preencher automaticamente esta posição.',
        ].join('\n\n')
      : 'Todas as posições foram preenchidas. Revise os significados e finalize com a síntese.'

    return [
      ...consultationLines,
      ...(orderedDrawnBlocks.length
        ? ['[[Cartas registradas até agora]]', ...orderedDrawnBlocks]
        : []),
      nextStepBlock,
      '((Dica privada: mantenha tom de voz pausado e finalize com um conselho prático.))',
    ].join('\n\n')
  }, [cardById, consultation, currentPosition, drawnByPosition, spread.positions])

  useEffect(() => {
    const storedSettings = localStorage.getItem(SETTINGS_STORAGE_KEY)
    const storedShortcuts = localStorage.getItem(SHORTCUT_STORAGE_KEY)

    if (storedSettings) {
      try {
        const parsed = JSON.parse(storedSettings) as Partial<TeleprompterSettings>
        setSettings(prev => ({ ...prev, ...parsed, wpm: DEFAULT_WPM }))
      } catch {
        // no-op
      }
    }

    if (storedShortcuts) {
      try {
        const parsed = JSON.parse(storedShortcuts) as Partial<ShortcutConfig>
        setShortcuts(prev => ({ ...prev, ...parsed }))
      } catch {
        // no-op
      }
    }
  }, [])

  useEffect(() => {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings))
  }, [settings])

  useEffect(() => {
    localStorage.setItem(SHORTCUT_STORAGE_KEY, JSON.stringify(shortcuts))
  }, [shortcuts])

  useEffect(() => {
    if (scriptMode === 'auto') {
      setScriptText(autoScript)
    }
  }, [autoScript, scriptMode])

  const registerCard = useCallback(
    (
      card: Card,
      isReversed: boolean,
      source: DrawnCard['source'],
      confidence?: number,
    ) => {
      let blockedReason = ''
      let shouldAdvance = false

      const drawn: DrawnCard = {
        position: currentPositionNumber,
        cardId: card.id,
        cardName: card.nome,
        isReversed,
        source,
        confidence,
      }

      setDrawnByPosition(prev => {
        const current = prev[currentPositionNumber]

        const duplicatedPosition = Object.values(prev).find(
          item => item.position !== currentPositionNumber && item.cardId === card.id,
        )
        if (duplicatedPosition) {
          blockedReason =
            `Carta repetida detectada (já registrada na posição ${duplicatedPosition.position}). ` +
            'Troque a carta para manter a tiragem consistente.'
          return prev
        }

        if (
          source === 'camera' &&
          current
        ) {
          blockedReason =
            current.cardId === card.id && current.isReversed === isReversed
              ? 'Carta já registrada nesta posição. Mostre a próxima carta.'
              : 'Posição já preenchida. Use navegação/manual para alterar esta posição.'
          return prev
        }

        if (source === 'manual' && current?.cardId === card.id && current.isReversed === isReversed) {
          blockedReason = 'Carta já registrada nesta posição.'
          return prev
        }

        shouldAdvance = true
        return { ...prev, [currentPositionNumber]: drawn }
      })

      if (blockedReason) {
        setControlFeedback(blockedReason)
        return
      }

      if (
        shouldAdvance &&
        autoAdvance &&
        currentPositionIndex < spread.positions.length - 1
      ) {
        setCurrentPositionIndex(prev => prev + 1)
      }
    },
    [
      autoAdvance,
      currentPositionIndex,
      currentPositionNumber,
      spread.positions,
    ],
  )

  const {
    status,
    error: recognitionError,
    resetLastConfirmation,
    localDiagnostics,
  } = useCardRecognition({
    videoRef,
    cards,
    enabled: recognitionEnabled && isActive,
    intervalMs: settings.recognitionIntervalMs,
    confidenceThreshold: settings.recognitionThreshold,
    minVotes: settings.recognitionMinVotes,
    onConfirmed: result => {
      if (!result.card) return
      registerCard(result.card, result.isReversed, 'camera', result.confidence)
    },
  })

  const recognitionHint = useMemo(() => {
    if (!recognitionEnabled) return 'Reconhecimento pausado manualmente.'
    if (status === 'loading') return 'Carregando motor de reconhecimento...'
    if (status === 'running') return 'Reconhecimento por modelo ativo.'
    if (status === 'running-local') {
      if (localDiagnostics.records === 0 && localDiagnostics.cards > 0) {
        return 'Catálogo local carregado apenas para referência. A confirmação automática exige capturas reais ou modelo treinado.'
      }
      return `Reconhecimento local ativo com ${localDiagnostics.cards} carta(s) utilizáveis.`
    }
    if (status === 'no-model') {
      if (localDiagnostics.records > 0 && localDiagnostics.cards === 0) {
        return 'Capturas locais existem, mas não foram convertidas para reconhecimento. Reimporte as capturas dessa carta via ZIP.'
      }
      return 'Sem modelo e sem base local suficiente para reconhecer. Cadastre cartas ou envie o modelo.'
    }
    if (status === 'error') {
      return recognitionError || 'Falha no reconhecimento.'
    }
    return 'Aguardando câmera e reconhecimento.'
  }, [
    localDiagnostics.cards,
    localDiagnostics.records,
    recognitionEnabled,
    recognitionError,
    status,
  ])

  useEffect(() => {
    if (!isActive && !isStarting && devices.length > 0) {
      void startCamera(currentDeviceId || devices[0].deviceId, selectedResolution)
    }
  }, [currentDeviceId, devices, isActive, isStarting, selectedResolution, startCamera])

  useEffect(() => {
    if (previousResolutionPresetRef.current === settings.resolutionPreset) return
    previousResolutionPresetRef.current = settings.resolutionPreset

    if (devices.length > 0 && !isStarting) {
      void startCamera(currentDeviceId || devices[0].deviceId, selectedResolution)
    }
  }, [
    currentDeviceId,
    devices,
    isStarting,
    selectedResolution,
    settings.resolutionPreset,
    startCamera,
  ])

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement))
    }

    document.addEventListener('fullscreenchange', onFullscreenChange)
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange)
    }
  }, [])

  useEffect(() => {
    return () => {
      if (wakeLockRef.current) {
        void wakeLockRef.current.release()
      }
    }
  }, [])

  useEffect(() => {
    resetLastConfirmation()
    const drawn = drawnByPosition[currentPositionNumber]
    if (drawn) {
      setManualCardId(String(drawn.cardId))
      setManualIsReversed(drawn.isReversed)
    } else {
      setManualCardId('')
      setManualIsReversed(false)
    }
  }, [currentPositionNumber, drawnByPosition, resetLastConfirmation])

  const requestWakeLock = useCallback(async () => {
    const wakeLockNavigator = navigator as Navigator & {
      wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> }
    }
    if (!wakeLockNavigator.wakeLock) return
    try {
      wakeLockRef.current = await wakeLockNavigator.wakeLock.request('screen')
    } catch {
      wakeLockRef.current = null
    }
  }, [])

  const enterFullscreen = useCallback(async () => {
    if (!document.fullscreenElement) {
      try {
        await document.documentElement.requestFullscreen()
        await requestWakeLock()
      } catch {
        // no-op
      }
    }
  }, [requestWakeLock])

  const exitFullscreen = useCallback(async () => {
    if (document.fullscreenElement) {
      await document.exitFullscreen()
    }
    if (wakeLockRef.current) {
      await wakeLockRef.current.release()
      wakeLockRef.current = null
    }
  }, [])

  const goNext = useCallback(() => {
    setCurrentPositionIndex(prev => Math.min(prev + 1, spread.positions.length - 1))
  }, [spread.positions.length])

  const goPrevious = useCallback(() => {
    setCurrentPositionIndex(prev => Math.max(prev - 1, 0))
  }, [])

  const handleManualConfirm = () => {
    if (!manualCardId) return
    const selected = cards.find(card => card.id === Number(manualCardId))
    if (!selected) return
    registerCard(selected, manualIsReversed, 'manual')
  }

  const updateActiveParagraphFromScroll = useCallback(() => {
    const container = scriptWindowRef.current
    if (!container) return

    const centerY = container.scrollTop + container.clientHeight / 2
    let bestIndex = 0
    let bestDistance = Number.POSITIVE_INFINITY

    paragraphRefs.current.forEach((paragraph, index) => {
      if (!paragraph) return
      const paragraphCenter = paragraph.offsetTop + paragraph.clientHeight / 2
      const distance = Math.abs(centerY - paragraphCenter)
      if (distance < bestDistance) {
        bestDistance = distance
        bestIndex = index
      }
    })

    setActiveParagraphIndex(prev => (prev === bestIndex ? prev : bestIndex))
  }, [])

  const estimateTargetSpeed = useCallback(() => {
    const container = scriptWindowRef.current
    if (!container) return 0
    const words = scriptText.trim().split(/\s+/).filter(Boolean).length
    if (words === 0) return 0

    const distance = Math.max(0, container.scrollHeight - container.clientHeight)
    if (distance === 0) return 0

    const durationSeconds = (words / settings.wpm) * 60
    if (durationSeconds <= 0) return 0

    return distance / durationSeconds
  }, [scriptText, settings.wpm])

  const syncToActiveParagraph = useCallback(() => {
    const container = scriptWindowRef.current
    const paragraph = paragraphRefs.current[activeParagraphIndex]
    if (!container || !paragraph) return

    const targetTop = Math.max(0, paragraph.offsetTop - container.clientHeight * 0.35)
    container.scrollTo({ top: targetTop, behavior: 'smooth' })
  }, [activeParagraphIndex])

  useEffect(() => {
    const container = scriptWindowRef.current
    if (!container) return

    const handleScroll = () => {
      updateActiveParagraphFromScroll()
    }

    container.addEventListener('scroll', handleScroll)
    return () => {
      container.removeEventListener('scroll', handleScroll)
    }
  }, [updateActiveParagraphFromScroll])

  useEffect(() => {
    if (!isScrolling) {
      if (scrollAnimationRef.current) {
        cancelAnimationFrame(scrollAnimationRef.current)
      }
      scrollAnimationRef.current = null
      lastFrameRef.current = null
      speedPxRef.current = 0
      return
    }

    const tick = (timestamp: number) => {
      const container = scriptWindowRef.current
      if (!container) {
        setIsScrolling(false)
        return
      }

      if (lastFrameRef.current === null) {
        lastFrameRef.current = timestamp
      }

      const deltaSeconds = (timestamp - lastFrameRef.current) / 1000
      lastFrameRef.current = timestamp

      const targetSpeed = estimateTargetSpeed()
      if (settings.smoothAcceleration) {
        speedPxRef.current +=
          (targetSpeed - speedPxRef.current) * Math.min(1, deltaSeconds * 5)
      } else {
        speedPxRef.current = targetSpeed
      }

      container.scrollTop += speedPxRef.current * deltaSeconds
      updateActiveParagraphFromScroll()

      const maxScrollTop = container.scrollHeight - container.clientHeight
      if (container.scrollTop >= maxScrollTop - 1) {
        setIsScrolling(false)
        return
      }

      scrollAnimationRef.current = requestAnimationFrame(tick)
    }

    scrollAnimationRef.current = requestAnimationFrame(tick)
    return () => {
      if (scrollAnimationRef.current) {
        cancelAnimationFrame(scrollAnimationRef.current)
      }
      scrollAnimationRef.current = null
      lastFrameRef.current = null
      speedPxRef.current = 0
    }
  }, [estimateTargetSpeed, isScrolling, settings.smoothAcceleration, updateActiveParagraphFromScroll])

  useEffect(() => {
    if (!isScrolling) return

    const timerId = window.setInterval(() => {
      setElapsedSeconds(prev => prev + 1)
      setCountdownRemainingSeconds(prev => (prev > 0 ? prev - 1 : 0))
    }, 1000)

    return () => {
      window.clearInterval(timerId)
    }
  }, [isScrolling])

  useEffect(() => {
    if (countdownRemainingSeconds === 0 && countdownMinutes > 0 && isScrolling) {
      setIsScrolling(false)
      setControlFeedback('Cronômetro finalizado.')
    }
  }, [countdownMinutes, countdownRemainingSeconds, isScrolling])

  const adjustWpm = useCallback((delta: number) => {
    setSettings(prev => ({
      ...prev,
      wpm: Math.min(260, Math.max(40, prev.wpm + delta)),
    }))
  }, [])

  const handleApplyCountdown = () => {
    const total = Math.max(0, Math.floor(countdownMinutes * 60))
    setCountdownRemainingSeconds(total)
  }

  const paragraphs = useMemo(() => {
    const normalized = scriptText.replace(/\r\n/g, '\n').trim()
    if (!normalized) return ['Sem roteiro disponível no momento.']
    return normalized.split(/\n{2,}/).map(block => block.trim()).filter(Boolean)
  }, [scriptText])

  const renderParagraph = (paragraph: string) => {
    const segments = parseAnnotatedSegments(paragraph)
    return segments.map((segment, index) => {
      if (segment.type === 'highlight') {
        return (
          <mark key={`highlight-${index}`} className="tp-highlight-token">
            {segment.value}
          </mark>
        )
      }

      if (segment.type === 'note') {
        return (
          <span key={`note-${index}`} className="tp-note-token">
            {segment.value}
          </span>
        )
      }

      return <span key={`text-${index}`}>{segment.value}</span>
    })
  }

  const handleScriptChange = (value: string) => {
    setScriptMode('manual')
    setScriptText(value)
  }

  const handleResetAutoScript = () => {
    setScriptMode('auto')
    setScriptText(autoScript)
  }

  const handleImportScript = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    const extension = file.name.split('.').pop()?.toLowerCase() || ''
    if (!['txt', 'md', 'markdown'].includes(extension)) {
      setControlFeedback('Importação disponível nesta versão para TXT/MD.')
      return
    }

    try {
      const content = await file.text()
      setScriptMode('manual')
      setScriptText(content)
      setControlFeedback('Script importado com sucesso.')
    } catch {
      setControlFeedback('Falha ao importar script.')
    }
  }

  const handleExportScript = () => {
    const blob = new Blob([scriptText], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `roteiro_${spread.id}_${Date.now()}.txt`
    link.click()
    URL.revokeObjectURL(url)
    setControlFeedback('Script exportado.')
  }

  const applyShortcutAction = useCallback(
    (action: ShortcutAction) => {
      if (action === 'togglePlay') {
        setIsScrolling(prev => !prev)
        return
      }

      if (action === 'faster') {
        adjustWpm(1)
        return
      }

      if (action === 'slower') {
        adjustWpm(-1)
        return
      }

      if (action === 'next') {
        goNext()
        return
      }

      if (action === 'previous') {
        goPrevious()
        return
      }

      if (action === 'fullscreen') {
        if (document.fullscreenElement) {
          void exitFullscreen()
        } else {
          void enterFullscreen()
        }
        return
      }

      if (action === 'sync') {
        syncToActiveParagraph()
      }
    },
    [adjustWpm, enterFullscreen, exitFullscreen, goNext, goPrevious, syncToActiveParagraph],
  )

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (capturingShortcut) {
        event.preventDefault()
        if (event.code === 'Escape') {
          setCapturingShortcut(null)
          return
        }

        setShortcuts(prev => ({ ...prev, [capturingShortcut]: event.code }))
        setCapturingShortcut(null)
        return
      }

      const target = event.target as HTMLElement | null
      const tagName = target?.tagName || ''
      if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') {
        return
      }

      const matchedAction = (Object.entries(shortcuts).find(
        ([, shortcut]) => shortcut === event.code,
      )?.[0] || null) as ShortcutAction | null

      if (!matchedAction) return

      event.preventDefault()
      applyShortcutAction(matchedAction)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [applyShortcutAction, capturingShortcut, shortcuts])

  const executeVoiceCommand = useCallback(
    (transcript: string) => {
      const normalized = normalizeText(transcript)

      if (normalized.includes('pausa') || normalized.includes('parar')) {
        setIsScrolling(false)
        return
      }

      if (
        normalized.includes('continuar') ||
        normalized.includes('iniciar') ||
        normalized.includes('retomar')
      ) {
        setIsScrolling(true)
        return
      }

      if (
        normalized.includes('mais rapido') ||
        normalized.includes('acelerar') ||
        normalized.includes('velocidade maior')
      ) {
        adjustWpm(2)
        return
      }

      if (
        normalized.includes('mais devagar') ||
        normalized.includes('reduzir velocidade')
      ) {
        adjustWpm(-2)
        return
      }

      if (normalized.includes('proxima')) {
        goNext()
        return
      }

      if (normalized.includes('anterior')) {
        goPrevious()
      }
    },
    [adjustWpm, goNext, goPrevious],
  )

  const toggleVoiceControl = useCallback(() => {
    const speechWindow = window as Window & {
      SpeechRecognition?: SpeechRecognitionCtor
      webkitSpeechRecognition?: SpeechRecognitionCtor
    }

    if (voiceEnabledRef.current) {
      voiceEnabledRef.current = false
      voiceRecognitionRef.current?.stop()
      setVoiceStatus('idle')
      return
    }

    const RecognitionCtor =
      speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition
    if (!RecognitionCtor) {
      setVoiceStatus('unsupported')
      setControlFeedback('Reconhecimento de voz não suportado neste navegador.')
      return
    }

    const recognition = new RecognitionCtor()
    recognition.continuous = true
    recognition.interimResults = false
    recognition.lang = 'pt-BR'
    recognition.onresult = event => {
      const result = event.results[event.results.length - 1]
      const transcript = result?.[0]?.transcript || ''
      executeVoiceCommand(transcript)
    }
    recognition.onerror = () => {
      setVoiceStatus('error')
      voiceEnabledRef.current = false
    }
    recognition.onend = () => {
      if (!voiceEnabledRef.current) {
        setVoiceStatus('idle')
        return
      }
      try {
        recognition.start()
      } catch {
        setVoiceStatus('error')
      }
    }

    voiceRecognitionRef.current = recognition
    voiceEnabledRef.current = true
    setVoiceStatus('listening')

    try {
      recognition.start()
    } catch {
      setVoiceStatus('error')
      voiceEnabledRef.current = false
    }
  }, [executeVoiceCommand])

  useEffect(() => {
    return () => {
      voiceEnabledRef.current = false
      voiceRecognitionRef.current?.stop()
    }
  }, [])

  const completion = Object.keys(drawnByPosition).length
  const totalPositions = spread.positions.length
  const progressLabel = `${completion}/${totalPositions} posições preenchidas`

  const handleSaveSession = async () => {
    const ordered = spread.positions
      .map(position => drawnByPosition[position.index])
      .filter((drawn): drawn is DrawnCard => Boolean(drawn))

    if (!ordered.length) return

    setIsSaving(true)
    setSaveFeedback('')
    try {
      await onSaveSession(ordered)
      setSaveFeedback('Sessão salva no histórico local.')
    } catch {
      setSaveFeedback('Falha ao salvar sessão.')
    } finally {
      setIsSaving(false)
    }
  }

  const buildSpreadSynthesis = useCallback(
    (orderedDrawn: DrawnCard[]) =>
      generateAdvancedSpreadSynthesis({
        spread,
        orderedDrawn,
        cardById,
        consultation,
      }),
    [cardById, consultation, spread],
  )

  const getOrderedDrawnCards = useCallback(
    () =>
      spread.positions
        .map(position => drawnByPosition[position.index])
        .filter((drawn): drawn is DrawnCard => Boolean(drawn)),
    [drawnByPosition, spread.positions],
  )

  useEffect(() => {
    const ordered = getOrderedDrawnCards()
    if (ordered.length !== totalPositions || totalPositions === 0) return

    const signature = ordered
      .map(item => `${item.position}:${item.cardId}:${item.isReversed ? 'r' : 'v'}`)
      .join('|')
    if (!signature || autoSynthesisKeyRef.current === signature) return

    autoSynthesisKeyRef.current = signature
    setSynthesisText(buildSpreadSynthesis(ordered))
    setControlFeedback('Tiragem completa. Síntese final gerada automaticamente.')
  }, [buildSpreadSynthesis, getOrderedDrawnCards, totalPositions])

  const handleGenerateSynthesis = () => {
    const ordered = getOrderedDrawnCards()

    if (!ordered.length) {
      setControlFeedback('Registre pelo menos uma carta para gerar a síntese.')
      return
    }

    setSynthesisText(buildSpreadSynthesis(ordered))
    setControlFeedback('Síntese final gerada.')
  }

  const handleUseSynthesisAsScript = () => {
    if (!synthesisText) return
    setScriptMode('manual')
    setScriptText(synthesisText)
    setControlFeedback('Síntese aplicada ao teleprompter.')
  }

  const handleCopySynthesis = async () => {
    if (!synthesisText) return
    try {
      await navigator.clipboard.writeText(synthesisText)
      setControlFeedback('Síntese copiada.')
    } catch {
      setControlFeedback('Não foi possível copiar a síntese neste navegador.')
    }
  }

  const scriptStyle = {
    '--tp-font-size': `${settings.fontSize}px`,
    '--tp-line-height': `${settings.lineHeight}`,
    '--tp-font-family': settings.fontFamily,
    '--tp-text-color': settings.highVisibility ? '#ffffff' : settings.textColor,
    '--tp-bg-color': settings.highVisibility ? '#000000' : settings.backgroundColor,
    '--tp-max-width': `${settings.maxTextWidth}%`,
    '--tp-text-align': settings.textAlign,
    '--tp-render-scale': `${settings.renderScale}`,
  } as CSSProperties

  const isScriptFlipped = settings.flipHorizontal || settings.flipVertical

  return (
    <div className="teleprompter-view">
      <CameraView
        videoRef={videoRef}
        devices={devices}
        currentDeviceId={currentDeviceId}
        isActive={isActive}
        isStarting={isStarting}
        error={cameraError}
        onStart={() =>
          startCamera(currentDeviceId || devices[0]?.deviceId, selectedResolution)
        }
        onSwitch={deviceId => switchCamera(deviceId, selectedResolution)}
      />

      <div className={`text-overlay ${isPanelExpanded ? 'expanded' : 'collapsed'}`}>
        <button
          className="tp-panel-toggle"
          onClick={() => setIsPanelExpanded(prev => !prev)}
          aria-expanded={isPanelExpanded}
          aria-controls="teleprompter-panel-content"
        >
          <div className="tp-panel-toggle-main">
            <span className="tp-panel-title">Iniciar Tiragem</span>
            <span className="tp-panel-state">
              {isPanelExpanded ? 'Ocultar funções' : 'Mostrar funções'}
            </span>
          </div>
          <div className="tp-panel-toggle-badges">
            <span>{progressLabel}</span>
            <span>WPM: {settings.wpm}</span>
          </div>
        </button>

        {isPanelExpanded && (
          <div id="teleprompter-panel-content" className="text-overlay-content">
            <div className="teleprompter-topline">
              <div>
                <h2>{currentPosition?.nome || 'Posição'}</h2>
                <p className="position-desc">{currentPosition?.descricao}</p>
                {consultationSummary && (
                  <p className="reading-context">{consultationSummary}</p>
                )}
              </div>
              <div className="topline-meta">
                <span>{progressLabel}</span>
                <span>WPM: {settings.wpm}</span>
                <span>Tempo: {formatTime(elapsedSeconds)}</span>
                {countdownRemainingSeconds > 0 && (
                  <span>Restante: {formatTime(countdownRemainingSeconds)}</span>
                )}
              </div>
            </div>

            <div className="card-info">
              <h1>{currentCard?.nome || 'Aguardando carta...'}</h1>
              <p className="status">
                {currentDrawn
                  ? `Orientação ${currentDrawn.isReversed ? 'Invertida' : 'Vertical'}`
                  : 'Nenhuma carta registrada nesta posição'}
              </p>
              <p className="recognition-hint">{recognitionHint}</p>
              {currentCard && (
                <div className="card-meta">
                  <p>
                    <strong>Arcano:</strong> {formatArcanoLabel(currentCard)}{' '}
                    {currentCard.arcanoDescricao ? `- ${currentCard.arcanoDescricao}` : ''}
                  </p>
                  <p>
                    <strong>Naipe/Elemento:</strong> {formatNaipeElementLabel(currentCard)}
                    {currentCard.elemento ? ` - ${currentCard.elemento.descricao}` : ''}
                  </p>
                  {currentCard.representacao && (
                    <p>
                      <strong>Representa:</strong> {currentCard.representacao}
                    </p>
                  )}
                  {currentCard.numerologia && (
                    <p>
                      <strong>Numerologia:</strong> {currentCard.numerologia.valor} (
                      {currentCard.numerologia.titulo}) -{' '}
                      {currentCard.numerologia.descricao}
                    </p>
                  )}
                  {(currentCard.polaridades?.luz || currentCard.polaridades?.sombra) && (
                    <p>
                      <strong>Luz/Sombra:</strong>{' '}
                      {currentCard.polaridades?.luz || currentCard.significado.vertical.curto}
                      {' | '}
                      {currentCard.polaridades?.sombra ||
                        currentCard.significado.invertido.curto}
                    </p>
                  )}
                  {currentCard.corte && (
                    <p>
                      <strong>Corte:</strong> {currentCard.corte.titulo} -{' '}
                      {currentCard.corte.descricao}
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="teleprompter-actions">
              <button onClick={() => setIsScrolling(prev => !prev)}>
                {isScrolling ? 'Pausar rolagem' : 'Iniciar rolagem'}
              </button>
              <button
                type="button"
                className={`secondary tp-action-controls-toggle${
                  isActionControlsExpanded ? ' active' : ''
                }`}
                onClick={() => setIsActionControlsExpanded(prev => !prev)}
                aria-expanded={isActionControlsExpanded}
                aria-controls="teleprompter-actions-extra"
                aria-label={
                  isActionControlsExpanded ? 'Ocultar ações rápidas' : 'Mostrar ações rápidas'
                }
              >
                ⋯
              </button>
              <div
                id="teleprompter-actions-extra"
                className="teleprompter-actions-extra"
                hidden={!isActionControlsExpanded}
              >
                <button className="secondary" onClick={() => adjustWpm(-1)}>
                  -1 WPM
                </button>
                <button className="secondary" onClick={() => adjustWpm(1)}>
                  +1 WPM
                </button>
                <button className="secondary" onClick={syncToActiveParagraph}>
                  Sincronizar
                </button>
                <button className="secondary" onClick={toggleVoiceControl}>
                  Voz: {voiceStatus === 'listening' ? 'ON' : 'OFF'}
                </button>
                <button className="secondary" onClick={() => fileInputRef.current?.click()}>
                  Importar TXT/MD
                </button>
                <button className="secondary" onClick={handleExportScript}>
                  Exportar roteiro
                </button>
                <button className="secondary" onClick={enterFullscreen}>
                  Tela cheia
                </button>
                {isFullscreen && (
                  <button className="secondary" onClick={exitFullscreen}>
                    Sair da tela cheia
                  </button>
                )}
              </div>
            </div>

            <div className="wpm-slider-wrap">
              <label htmlFor="wpm-slider">Velocidade (WPM)</label>
              <input
                id="wpm-slider"
                type="range"
                min={40}
                max={260}
                step={1}
                value={settings.wpm}
                onChange={event =>
                  setSettings(prev => ({ ...prev, wpm: Number(event.target.value) }))
                }
              />
            </div>

            <div
              ref={scriptWindowRef}
              className={`script-window${settings.flipHorizontal ? ' flip-horizontal' : ''}${
                settings.flipVertical ? ' flip-vertical' : ''
              }${isScriptFlipped ? ' flipped' : ''}`}
              style={scriptStyle}
            >
              {settings.highlightLine && <div className="focus-line" />}
              <div className="script-content">
                {paragraphs.map((paragraph, index) => (
                  <p
                    key={`${index}-${paragraph.slice(0, 8)}`}
                    ref={element => {
                      paragraphRefs.current[index] = element
                    }}
                    className={index === activeParagraphIndex ? 'active-line' : ''}
                  >
                    {renderParagraph(paragraph)}
                  </p>
                ))}
              </div>
            </div>

            <div className="tp-extra-controls-toggle-wrap">
              <button
                type="button"
                className={`tp-extra-controls-toggle${
                  isExtraControlsExpanded ? ' expanded' : ''
                }`}
                onClick={() => setIsExtraControlsExpanded(prev => !prev)}
                aria-expanded={isExtraControlsExpanded}
                aria-controls="tp-extra-controls"
                aria-label={
                  isExtraControlsExpanded ? 'Ocultar controles extras' : 'Mostrar controles extras'
                }
              >
                <span aria-hidden="true">⋯</span>
              </button>
            </div>

            <div id="tp-extra-controls" className="tp-extra-controls" hidden={!isExtraControlsExpanded}>
              <details className="script-editor">
                <summary>Editor de roteiro e anotações</summary>
                <p>
                  Use <code>[[texto]]</code> para destaque e <code>((nota))</code> para
                  comentário privado.
                </p>
                <textarea
                  value={scriptText}
                  onChange={event => handleScriptChange(event.target.value)}
                />
                <div className="script-editor-actions">
                  <button className="secondary" onClick={handleResetAutoScript}>
                    Usar roteiro automático
                  </button>
                  <button
                    className="secondary"
                    onClick={() => {
                      const container = scriptWindowRef.current
                      if (container) container.scrollTo({ top: 0, behavior: 'smooth' })
                    }}
                  >
                    Ir para início
                  </button>
                  <button
                    className="secondary"
                    onClick={() => {
                      const container = scriptWindowRef.current
                      if (container) {
                        container.scrollTo({
                          top: container.scrollHeight,
                          behavior: 'smooth',
                        })
                      }
                    }}
                  >
                    Ir para fim
                  </button>
                </div>
              </details>

              <div className="manual-controls">
                <label htmlFor="manual-card">Selecionar carta manualmente</label>
                <div className="manual-row">
                  <select
                    id="manual-card"
                    value={manualCardId}
                    onChange={event => setManualCardId(event.target.value)}
                  >
                    <option value="">Selecione</option>
                    {cards.map(card => (
                      <option key={card.id} value={card.id}>
                        {card.nome}
                      </option>
                    ))}
                  </select>

                  <button
                    className={manualIsReversed ? 'secondary active' : 'secondary'}
                    onClick={() => setManualIsReversed(prev => !prev)}
                  >
                    {manualIsReversed ? 'Invertida' : 'Vertical'}
                  </button>
                  <button onClick={handleManualConfirm}>Registrar</button>
                </div>
              </div>

              <CardRecognizer
                enabled={recognitionEnabled}
                onToggle={() => setRecognitionEnabled(prev => !prev)}
              />

              <div className="controls">
                <button className="secondary" onClick={goPrevious}>
                  ← Posição anterior
                </button>
                <button
                  className="secondary"
                  onClick={goNext}
                  disabled={currentPositionIndex >= spread.positions.length - 1}
                >
                  Próxima posição →
                </button>
                <button
                  className={autoAdvance ? 'secondary active' : 'secondary'}
                  onClick={() => setAutoAdvance(prev => !prev)}
                >
                  Autoavanço: {autoAdvance ? 'ON' : 'OFF'}
                </button>
                <button
                  className="secondary"
                  onClick={() => setShowAdvancedPanel(prev => !prev)}
                >
                  Ajustes avançados
                </button>
                <button className="secondary" onClick={onBack}>
                  Voltar
                </button>
              </div>

              {showAdvancedPanel && (
                <div className="advanced-panel">
                  <h3>Ajustes Profissionais</h3>

                  <div className="advanced-grid">
                    <label>
                      Fonte
                      <select
                        value={settings.fontFamily}
                        onChange={event =>
                          setSettings(prev => ({ ...prev, fontFamily: event.target.value }))
                        }
                      >
                        {FONT_OPTIONS.map(option => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label>
                      Tamanho da fonte: {settings.fontSize}px
                      <input
                        type="range"
                        min={24}
                        max={80}
                        step={1}
                        value={settings.fontSize}
                        onChange={event =>
                          setSettings(prev => ({
                            ...prev,
                            fontSize: Number(event.target.value),
                          }))
                        }
                      />
                    </label>

                    <label>
                      Espaçamento de linha: {settings.lineHeight.toFixed(2)}
                      <input
                        type="range"
                        min={1.1}
                        max={2.3}
                        step={0.01}
                        value={settings.lineHeight}
                        onChange={event =>
                          setSettings(prev => ({
                            ...prev,
                            lineHeight: Number(event.target.value),
                          }))
                        }
                      />
                    </label>

                    <label>
                      Largura do texto: {settings.maxTextWidth}%
                      <input
                        type="range"
                        min={50}
                        max={100}
                        step={1}
                        value={settings.maxTextWidth}
                        onChange={event =>
                          setSettings(prev => ({
                            ...prev,
                            maxTextWidth: Number(event.target.value),
                          }))
                        }
                      />
                    </label>

                    <label>
                      Alinhamento
                      <select
                        value={settings.textAlign}
                        onChange={event =>
                          setSettings(prev => ({
                            ...prev,
                            textAlign: event.target.value as TextAlignMode,
                          }))
                        }
                      >
                        <option value="left">Esquerda</option>
                        <option value="center">Centro</option>
                        <option value="right">Direita</option>
                      </select>
                    </label>

                    <label>
                      Cor do texto
                      <input
                        type="color"
                        value={settings.textColor}
                        onChange={event =>
                          setSettings(prev => ({ ...prev, textColor: event.target.value }))
                        }
                      />
                    </label>

                    <label>
                      Cor de fundo
                      <input
                        type="color"
                        value={settings.backgroundColor}
                        onChange={event =>
                          setSettings(prev => ({
                            ...prev,
                            backgroundColor: event.target.value,
                          }))
                        }
                      />
                    </label>

                    <label>
                      Resolução da câmera
                      <select
                        value={settings.resolutionPreset}
                        onChange={event =>
                          setSettings(prev => ({
                            ...prev,
                            resolutionPreset: event.target.value as ResolutionPreset,
                          }))
                        }
                      >
                        <option value="high">Alta (1280x720)</option>
                        <option value="medium">Média (960x540)</option>
                        <option value="low">Baixa (640x480)</option>
                      </select>
                    </label>

                    <label>
                      Escala de render: {settings.renderScale.toFixed(2)}
                      <input
                        type="range"
                        min={0.75}
                        max={1}
                        step={0.01}
                        value={settings.renderScale}
                        onChange={event =>
                          setSettings(prev => ({
                            ...prev,
                            renderScale: Number(event.target.value),
                          }))
                        }
                      />
                    </label>

                    <label>
                      Intervalo inferência: {settings.recognitionIntervalMs}ms
                      <input
                        type="range"
                        min={120}
                        max={700}
                        step={10}
                        value={settings.recognitionIntervalMs}
                        onChange={event =>
                          setSettings(prev => ({
                            ...prev,
                            recognitionIntervalMs: Number(event.target.value),
                          }))
                        }
                      />
                    </label>

                    <label>
                      Confiança mínima: {(settings.recognitionThreshold * 100).toFixed(0)}%
                      <input
                        type="range"
                        min={0.5}
                        max={0.99}
                        step={0.01}
                        value={settings.recognitionThreshold}
                        onChange={event =>
                          setSettings(prev => ({
                            ...prev,
                            recognitionThreshold: Number(event.target.value),
                          }))
                        }
                      />
                    </label>

                    <label>
                      Votos mínimos: {settings.recognitionMinVotes}
                      <input
                        type="range"
                        min={1}
                        max={6}
                        step={1}
                        value={settings.recognitionMinVotes}
                        onChange={event =>
                          setSettings(prev => ({
                            ...prev,
                            recognitionMinVotes: Number(event.target.value),
                          }))
                        }
                      />
                    </label>

                    <label>
                      Cronômetro (minutos)
                      <input
                        type="number"
                        min={0}
                        value={countdownMinutes}
                        onChange={event => setCountdownMinutes(Number(event.target.value))}
                      />
                      <button
                        className="secondary"
                        type="button"
                        onClick={handleApplyCountdown}
                      >
                        Aplicar
                      </button>
                    </label>
                  </div>

                  <div className="toggle-grid">
                    <label>
                      <input
                        type="checkbox"
                        checked={settings.highVisibility}
                        onChange={event =>
                          setSettings(prev => ({
                            ...prev,
                            highVisibility: event.target.checked,
                          }))
                        }
                      />
                      Modo alta visibilidade
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={settings.flipHorizontal}
                        onChange={event =>
                          setSettings(prev => ({
                            ...prev,
                            flipHorizontal: event.target.checked,
                          }))
                        }
                      />
                      Flip horizontal
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={settings.flipVertical}
                        onChange={event =>
                          setSettings(prev => ({
                            ...prev,
                            flipVertical: event.target.checked,
                          }))
                        }
                      />
                      Flip vertical
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={settings.highlightLine}
                        onChange={event =>
                          setSettings(prev => ({
                            ...prev,
                            highlightLine: event.target.checked,
                          }))
                        }
                      />
                      Realce da linha atual
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={settings.smoothAcceleration}
                        onChange={event =>
                          setSettings(prev => ({
                            ...prev,
                            smoothAcceleration: event.target.checked,
                          }))
                        }
                      />
                      Aceleração suave
                    </label>
                  </div>

                  <div className="shortcut-panel">
                    <h4>Atalhos (teclado / pedal Bluetooth)</h4>
                    <div className="shortcut-grid">
                      {(Object.keys(shortcuts) as ShortcutAction[]).map(action => (
                        <div key={action} className="shortcut-item">
                          <span>{action}</span>
                          <button
                            className="secondary"
                            type="button"
                            onClick={() => setCapturingShortcut(action)}
                          >
                            {capturingShortcut === action
                              ? 'Pressione tecla...'
                              : formatShortcut(shortcuts[action])}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="session-footer">
              <button onClick={handleSaveSession} disabled={isSaving || completion === 0}>
                {isSaving ? 'Salvando...' : 'Salvar sessão'}
              </button>
              <button
                className="secondary"
                onClick={handleGenerateSynthesis}
                disabled={completion === 0}
              >
                Gerar Síntese da Tiragem
              </button>
              {saveFeedback && <p className="save-feedback">{saveFeedback}</p>}
              {controlFeedback && <p className="control-feedback">{controlFeedback}</p>}
            </div>

            {synthesisText && (
              <div className="synthesis-panel">
                <h4>Síntese Final da Tiragem</h4>
                <textarea value={synthesisText} readOnly />
                <div className="synthesis-actions">
                  <button className="secondary" onClick={handleUseSynthesisAsScript}>
                    Usar no teleprompter
                  </button>
                  <button className="secondary" onClick={() => void handleCopySynthesis()}>
                    Copiar síntese
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept=".txt,.md,.markdown"
          onChange={handleImportScript}
          hidden
        />
      </div>
    </div>
  )
}

export default TeleprompterView
