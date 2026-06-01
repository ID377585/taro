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
const DEFAULT_FONT_SIZE = 24
const DEFAULT_LINE_HEIGHT = 1.4
const DEFAULT_MAX_TEXT_WIDTH = 100

const DEFAULT_SETTINGS: TeleprompterSettings = {
  wpm: DEFAULT_WPM,
  fontSize: DEFAULT_FONT_SIZE,
  lineHeight: DEFAULT_LINE_HEIGHT,
  fontFamily: '"Segoe UI", Tahoma, sans-serif',
  textColor: '#ffffff',
  backgroundColor: '#060606',
  maxTextWidth: DEFAULT_MAX_TEXT_WIDTH,
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
      segments.push({ type: 'text', value: paragraph.slice(lastIndex, match.index) })
    }
    if (match[1]) segments.push({ type: 'highlight', value: match[1] })
    else if (match[2]) segments.push({ type: 'note', value: match[2] })
    lastIndex = pattern.lastIndex
    match = pattern.exec(paragraph)
  }

  if (lastIndex < paragraph.length) {
    segments.push({ type: 'text', value: paragraph.slice(lastIndex) })
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
  const [isReadingInfoExpanded, setIsReadingInfoExpanded] = useState(false)
  const [isActionControlsExpanded, setIsActionControlsExpanded] = useState(false)
  const [isExtraControlsExpanded, setIsExtraControlsExpanded] = useState(false)
  const [controlFeedback, setControlFeedback] = useState('')
  const [synthesisText, setSynthesisText] = useState('')
  const [currentPositionIndex, setCurrentPositionIndex] = useState(0)
  const [drawnByPosition, setDrawnByPosition] = useState<Record<number, DrawnCard>>({})
  const [manualCardId, setManualCardId] = useState('')
  const [manualIsReversed, setManualIsReversed] = useState(false)
  const [recognitionEnabled, setRecognitionEnabled] = useState(false)
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
  const [voiceStatus, setVoiceStatus] = useState<'idle' | 'listening' | 'unsupported' | 'error'>('idle')

  const selectedResolution = RESOLUTION_PRESETS[settings.resolutionPreset]

  const {
    devices,
    currentDeviceId,
    isActive,
    isStarting,
    error: cameraError,
    startCamera,
    stopCamera,
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
    if (consultation.tipo === 'pessoal') return `ATENDIMENTO PESSOAL: ${pessoa1Context}`
    const pessoa2Context = formatConsultationPerson(consultation.pessoa2, 'PESSOA 2')
    return `SOBRE OUTRA PESSOA: ${pessoa1Context} E ${pessoa2Context}`
  }, [consultation])

  const autoScript = useMemo(() => {
    if (!currentPosition) return 'Selecione uma posição da tiragem.'
    const consultationLines: string[] = []
    if (consultation) {
      const pessoa1Context = formatConsultationPerson(consultation.pessoa1, 'PESSOA 1')
      const situation = toUppercaseDisplay(consultation.situacaoPrincipal)
      if (consultation.tipo === 'pessoal') {
        const adjective = consultation.pessoa1.sexo === 'feminino' ? 'acolhida' : 'acolhido'
        consultationLines.push('[[ATENDIMENTO PESSOAL]]', `Cliente: ${pessoa1Context}`, `Situação principal: ${situation}`, `Condução sugerida: mantenha um tom claro e ${adjective}, com foco em passos concretos.`)
      } else {
        const pessoa2Context = formatConsultationPerson(consultation.pessoa2, 'PESSOA 2')
        const pessoa1Pronome = consultation.pessoa1.sexo === 'feminino' ? 'ela' : 'ele'
        const pessoa2Pronome = consultation.pessoa2?.sexo === 'feminino' ? 'ela' : 'ele'
        consultationLines.push('[[LEITURA SOBRE OUTRA PESSOA]]', `Pessoa 1: ${pessoa1Context}`, `Pessoa 2: ${pessoa2Context}`, `Situação principal: ${situation}`, `Condução sugerida: explique a dinâmica entre as pessoas, validando como ${pessoa1Pronome} e ${pessoa2Pronome} contribuem para o cenário atual.`)
      }
    }

    const orderedDrawnBlocks = spread.positions
      .map(position => {
        const drawn = drawnByPosition[position.index]
        if (!drawn) return null
        const card = cardById.get(drawn.cardId)
        if (!card) return null
        const orientationLabel = drawn.isReversed ? 'Invertida' : 'Vertical'
        const coreMeaning = drawn.isReversed ? card.significado.invertido.longo : card.significado.vertical.longo
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
        ].filter(Boolean).join('\n\n')
      })
      .filter((block): block is string => Boolean(block))

    const nextPendingPosition = spread.positions.find(position => !drawnByPosition[position.index])
    const nextStepBlock = nextPendingPosition
      ? [`[[Próxima posição ${nextPendingPosition.index}: ${nextPendingPosition.nome}]]`, nextPendingPosition.descricao, 'Aponte a carta para a câmera para preencher automaticamente esta posição.'].join('\n\n')
      : 'Todas as posições foram preenchidas. Revise os significados e finalize com a síntese.'

    return [...consultationLines, ...(orderedDrawnBlocks.length ? ['[[Cartas registradas até agora]]', ...orderedDrawnBlocks] : []), nextStepBlock, '((Dica privada: mantenha tom de voz pausado e finalize com um conselho prático.))'].join('\n\n')
  }, [cardById, consultation, currentPosition, drawnByPosition, spread.positions])

  useEffect(() => {
    const storedSettings = localStorage.getItem(SETTINGS_STORAGE_KEY)
    const storedShortcuts = localStorage.getItem(SHORTCUT_STORAGE_KEY)
    if (storedSettings) {
      try {
        const parsed = JSON.parse(storedSettings) as Partial<TeleprompterSettings>
        setSettings(prev => ({ ...prev, ...parsed, wpm: DEFAULT_WPM, fontSize: DEFAULT_FONT_SIZE, lineHeight: DEFAULT_LINE_HEIGHT, maxTextWidth: DEFAULT_MAX_TEXT_WIDTH }))
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

  useEffect(() => { localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings)) }, [settings])
  useEffect(() => { localStorage.setItem(SHORTCUT_STORAGE_KEY, JSON.stringify(shortcuts)) }, [shortcuts])
  useEffect(() => { if (scriptMode === 'auto') setScriptText(autoScript) }, [autoScript, scriptMode])
  useEffect(() => {
    if (isPanelExpanded) return
    setIsReadingInfoExpanded(false)
    setIsActionControlsExpanded(false)
    setIsExtraControlsExpanded(false)
    setShowAdvancedPanel(false)
  }, [isPanelExpanded])

  const registerCard = useCallback((card: Card, isReversed: boolean, source: DrawnCard['source'], confidence?: number) => {
    let blockedReason = ''
    let shouldAdvance = false
    const drawn: DrawnCard = { position: currentPositionNumber, cardId: card.id, cardName: card.nome, isReversed, source, confidence }
    setDrawnByPosition(prev => {
      const current = prev[currentPositionNumber]
      const duplicatedPosition = Object.values(prev).find(item => item.position !== currentPositionNumber && item.cardId === card.id)
      if (duplicatedPosition) {
        blockedReason = `Carta repetida detectada (já registrada na posição ${duplicatedPosition.position}). Troque a carta para manter a tiragem consistente.`
        return prev
      }
      if (source === 'camera' && current) {
        blockedReason = current.cardId === card.id && current.isReversed === isReversed ? 'Carta já registrada nesta posição. Mostre a próxima carta.' : 'Posição já preenchida. Use navegação/manual para alterar esta posição.'
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
    if (shouldAdvance && autoAdvance && currentPositionIndex < spread.positions.length - 1) setCurrentPositionIndex(prev => prev + 1)
  }, [autoAdvance, currentPositionIndex, currentPositionNumber, spread.positions.length])

  const { status, error: recognitionError, resetLastConfirmation, localDiagnostics } = useCardRecognition({
    videoRef,
    cards,
    enabled: recognitionEnabled && isActive,
    intervalMs: settings.recognitionIntervalMs,
    confidenceThreshold: settings.recognitionThreshold,
    minVotes: settings.recognitionMinVotes,
    onConfirmed: result => { if (result.card) registerCard(result.card, result.isReversed, 'camera', result.confidence) },
  })

  const recognitionHint = useMemo(() => {
    if (!isActive) return 'Câmera desligada. Toque em Ativar câmera quando for reconhecer cartas.'
    if (!recognitionEnabled) return 'Reconhecimento pausado manualmente.'
    if (status === 'loading') return 'Carregando motor de reconhecimento...'
    if (status === 'running') return 'Reconhecimento por modelo ativo.'
    if (status === 'running-marker') return 'Tarot Vision Mark ativo. Enquadre a carta inteira, com os quatro cantos e marcadores visíveis.'
    if (status === 'running-local') return 'Reconhecimento local antigo desativado para evitar leituras erradas. Use cartas com Tarot Vision Mark.'
    if (status === 'no-model') return 'Sem modelo treinado. Usando apenas Tarot Vision Mark nas cartas marcadas.'
    if (status === 'error') return recognitionError || 'Falha no reconhecimento.'
    return 'Aguardando câmera e reconhecimento.'
  }, [isActive, localDiagnostics.cards, localDiagnostics.records, recognitionEnabled, recognitionError, status])

  const handleStartCamera = useCallback(async () => {
    await startCamera(currentDeviceId || devices[0]?.deviceId, selectedResolution)
    setRecognitionEnabled(true)
  }, [currentDeviceId, devices, selectedResolution, startCamera])

  const handleSwitchCamera = useCallback(async (deviceId: string) => {
    await switchCamera(deviceId, selectedResolution)
    setRecognitionEnabled(true)
  }, [selectedResolution, switchCamera])

  useEffect(() => {
    if (previousResolutionPresetRef.current === settings.resolutionPreset) return
    previousResolutionPresetRef.current = settings.resolutionPreset
    if (isActive && !isStarting) {
      void startCamera(currentDeviceId || devices[0]?.deviceId, selectedResolution)
    }
  }, [currentDeviceId, devices, isActive, isStarting, selectedResolution, settings.resolutionPreset, startCamera])

  useEffect(() => () => {
    setRecognitionEnabled(false)
    stopCamera()
  }, [stopCamera])

  useEffect(() => {
    const onFullscreenChange = () => setIsFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', onFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange)
  }, [])

  useEffect(() => () => { if (wakeLockRef.current) void wakeLockRef.current.release() }, [])
  useEffect(() => {
    resetLastConfirmation()
    const drawn = drawnByPosition[currentPositionNumber]
    setManualCardId(drawn ? String(drawn.cardId) : '')
    setManualIsReversed(Boolean(drawn?.isReversed))
  }, [currentPositionNumber, drawnByPosition, resetLastConfirmation])

  const requestWakeLock = useCallback(async () => {
    const wakeLockNavigator = navigator as Navigator & { wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> } }
    if (!wakeLockNavigator.wakeLock) return
    try { wakeLockRef.current = await wakeLockNavigator.wakeLock.request('screen') } catch { wakeLockRef.current = null }
  }, [])
  const enterFullscreen = useCallback(async () => { if (!document.fullscreenElement) { try { await document.documentElement.requestFullscreen(); await requestWakeLock() } catch { /* no-op */ } } }, [requestWakeLock])
  const exitFullscreen = useCallback(async () => { if (document.fullscreenElement) await document.exitFullscreen(); if (wakeLockRef.current) { await wakeLockRef.current.release(); wakeLockRef.current = null } }, [])
  const goNext = useCallback(() => setCurrentPositionIndex(prev => Math.min(prev + 1, spread.positions.length - 1)), [spread.positions.length])
  const goPrevious = useCallback(() => setCurrentPositionIndex(prev => Math.max(prev - 1, 0)), [])
  const handleManualConfirm = () => { if (!manualCardId) return; const selected = cards.find(card => card.id === Number(manualCardId)); if (selected) registerCard(selected, manualIsReversed, 'manual') }

  const updateActiveParagraphFromScroll = useCallback(() => {
    const container = scriptWindowRef.current
    if (!container) return
    const centerY = container.scrollTop + container.clientHeight / 2
    let bestIndex = 0
    let bestDistance = Number.POSITIVE_INFINITY
    paragraphRefs.current.forEach((paragraph, index) => {
      if (!paragraph) return
      const distance = Math.abs(centerY - (paragraph.offsetTop + paragraph.clientHeight / 2))
      if (distance < bestDistance) { bestDistance = distance; bestIndex = index }
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
    return durationSeconds <= 0 ? 0 : distance / durationSeconds
  }, [scriptText, settings.wpm])
  const syncToActiveParagraph = useCallback(() => {
    const container = scriptWindowRef.current
    const paragraph = paragraphRefs.current[activeParagraphIndex]
    if (!container || !paragraph) return
    container.scrollTo({ top: Math.max(0, paragraph.offsetTop - container.clientHeight * 0.35), behavior: 'smooth' })
  }, [activeParagraphIndex])

  useEffect(() => {
    const container = scriptWindowRef.current
    if (!container) return
    const handleScroll = () => updateActiveParagraphFromScroll()
    container.addEventListener('scroll', handleScroll)
    return () => container.removeEventListener('scroll', handleScroll)
  }, [updateActiveParagraphFromScroll])

  useEffect(() => {
    if (!isScrolling) { if (scrollAnimationRef.current) cancelAnimationFrame(scrollAnimationRef.current); scrollAnimationRef.current = null; lastFrameRef.current = null; speedPxRef.current = 0; return }
    const tick = (timestamp: number) => {
      const container = scriptWindowRef.current
      if (!container) { setIsScrolling(false); return }
      if (lastFrameRef.current === null) lastFrameRef.current = timestamp
      const deltaSeconds = (timestamp - lastFrameRef.current) / 1000
      lastFrameRef.current = timestamp
      const targetSpeed = estimateTargetSpeed()
      speedPxRef.current = settings.smoothAcceleration ? speedPxRef.current + (targetSpeed - speedPxRef.current) * Math.min(1, deltaSeconds * 5) : targetSpeed
      container.scrollTop += speedPxRef.current * deltaSeconds
      updateActiveParagraphFromScroll()
      if (container.scrollTop >= container.scrollHeight - container.clientHeight - 1) { setIsScrolling(false); return }
      scrollAnimationRef.current = requestAnimationFrame(tick)
    }
    scrollAnimationRef.current = requestAnimationFrame(tick)
    return () => { if (scrollAnimationRef.current) cancelAnimationFrame(scrollAnimationRef.current); scrollAnimationRef.current = null; lastFrameRef.current = null; speedPxRef.current = 0 }
  }, [estimateTargetSpeed, isScrolling, settings.smoothAcceleration, updateActiveParagraphFromScroll])

  useEffect(() => {
    if (!isScrolling) return
    const timerId = window.setInterval(() => { setElapsedSeconds(prev => prev + 1); setCountdownRemainingSeconds(prev => (prev > 0 ? prev - 1 : 0)) }, 1000)
    return () => window.clearInterval(timerId)
  }, [isScrolling])
  useEffect(() => { if (countdownRemainingSeconds === 0 && countdownMinutes > 0 && isScrolling) { setIsScrolling(false); setControlFeedback('Cronômetro finalizado.') } }, [countdownMinutes, countdownRemainingSeconds, isScrolling])
  const adjustWpm = useCallback((delta: number) => setSettings(prev => ({ ...prev, wpm: Math.min(260, Math.max(40, prev.wpm + delta)) })), [])
  const handleApplyCountdown = () => setCountdownRemainingSeconds(Math.max(0, Math.floor(countdownMinutes * 60)))
  const paragraphs = useMemo(() => { const normalized = scriptText.replace(/\r\n/g, '\n').trim(); return normalized ? normalized.split(/\n{2,}/).map(block => block.trim()).filter(Boolean) : ['Sem roteiro disponível no momento.'] }, [scriptText])
  const renderParagraph = (paragraph: string) => parseAnnotatedSegments(paragraph).map((segment, index) => segment.type === 'highlight' ? <mark key={`highlight-${index}`} className="tp-highlight-token">{segment.value}</mark> : segment.type === 'note' ? <span key={`note-${index}`} className="tp-note-token">{segment.value}</span> : <span key={`text-${index}`}>{segment.value}</span>)
  const handleScriptChange = (value: string) => { setScriptMode('manual'); setScriptText(value) }
  const handleResetAutoScript = () => { setScriptMode('auto'); setScriptText(autoScript) }
  const handleImportScript = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const extension = file.name.split('.').pop()?.toLowerCase() || ''
    if (!['txt', 'md', 'markdown'].includes(extension)) { setControlFeedback('Importação disponível nesta versão para TXT/MD.'); return }
    try { const content = await file.text(); setScriptMode('manual'); setScriptText(content); setControlFeedback('Script importado com sucesso.') } catch { setControlFeedback('Falha ao importar script.') }
  }
  const handleExportScript = () => { const blob = new Blob([scriptText], { type: 'text/plain;charset=utf-8' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `roteiro_${spread.id}_${Date.now()}.txt`; link.click(); URL.revokeObjectURL(url); setControlFeedback('Script exportado.') }

  const applyShortcutAction = useCallback((action: ShortcutAction) => {
    if (action === 'togglePlay') { setIsScrolling(prev => !prev); return }
    if (action === 'faster') { adjustWpm(1); return }
    if (action === 'slower') { adjustWpm(-1); return }
    if (action === 'next') { goNext(); return }
    if (action === 'previous') { goPrevious(); return }
    if (action === 'fullscreen') { void (isFullscreen ? exitFullscreen() : enterFullscreen()); return }
    if (action === 'sync') syncToActiveParagraph()
  }, [adjustWpm, enterFullscreen, exitFullscreen, goNext, goPrevious, isFullscreen, syncToActiveParagraph])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (capturingShortcut) { event.preventDefault(); setShortcuts(prev => ({ ...prev, [capturingShortcut]: event.code })); setCapturingShortcut(null); return }
      const target = event.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
      const entry = (Object.entries(shortcuts) as Array<[ShortcutAction, string]>).find(([, code]) => code === event.code)
      if (!entry) return
      event.preventDefault()
      applyShortcutAction(entry[0])
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [applyShortcutAction, capturingShortcut, shortcuts])

  const toggleVoice = () => {
    const SpeechRecognitionCtor = (window as Window & { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor }).SpeechRecognition || (window as Window & { webkitSpeechRecognition?: SpeechRecognitionCtor }).webkitSpeechRecognition
    if (!SpeechRecognitionCtor) { setVoiceStatus('unsupported'); return }
    if (voiceEnabledRef.current && voiceRecognitionRef.current) { voiceEnabledRef.current = false; voiceRecognitionRef.current.stop(); setVoiceStatus('idle'); return }
    const recognition = new SpeechRecognitionCtor()
    recognition.continuous = true
    recognition.interimResults = false
    recognition.lang = 'pt-BR'
    recognition.onresult = event => {
      const last = event.results[event.results.length - 1]
      const transcript = normalizeText(last[0].transcript)
      if (transcript.includes('proxima') || transcript.includes('avancar')) goNext()
      if (transcript.includes('voltar') || transcript.includes('anterior')) goPrevious()
      if (transcript.includes('pausar') || transcript.includes('parar')) setIsScrolling(false)
      if (transcript.includes('iniciar') || transcript.includes('continuar')) setIsScrolling(true)
    }
    recognition.onerror = () => { setVoiceStatus('error'); voiceEnabledRef.current = false }
    recognition.onend = () => { if (voiceEnabledRef.current) { try { recognition.start() } catch { setVoiceStatus('error'); voiceEnabledRef.current = false } } }
    try { voiceEnabledRef.current = true; voiceRecognitionRef.current = recognition; recognition.start(); setVoiceStatus('listening') } catch { setVoiceStatus('error'); voiceEnabledRef.current = false }
  }

  const drawnCards = useMemo(() => spread.positions.map(position => drawnByPosition[position.index]).filter((item): item is DrawnCard => Boolean(item)), [drawnByPosition, spread.positions])
  const allPositionsFilled = drawnCards.length === spread.positions.length
  const handleSave = async () => { if (!drawnCards.length) { setSaveFeedback('Nenhuma carta registrada para salvar.'); return } setIsSaving(true); try { await onSaveSession(drawnCards); setSaveFeedback('Sessão salva no histórico.') } catch { setSaveFeedback('Falha ao salvar sessão.') } finally { setIsSaving(false) } }
  const generatedSynthesis = useMemo(() => generateAdvancedSpreadSynthesis({ spread, orderedDrawn: drawnCards, cardById, consultation }), [cardById, consultation, drawnCards, spread])
  useEffect(() => { const key = drawnCards.map(card => `${card.position}:${card.cardId}:${card.isReversed}`).join('|'); if (key !== autoSynthesisKeyRef.current) { autoSynthesisKeyRef.current = key; setSynthesisText(generatedSynthesis) } }, [drawnCards, generatedSynthesis])

  const rootStyle = {
    '--tp-bg-color': settings.backgroundColor,
    '--tp-text-color': settings.highVisibility ? '#ffffff' : settings.textColor,
    '--tp-font-family': settings.fontFamily,
    '--tp-font-size': `${settings.fontSize}px`,
    '--tp-line-height': settings.lineHeight,
    '--tp-max-width': `${settings.maxTextWidth}%`,
    '--tp-text-align': settings.textAlign,
    '--tp-render-scale': settings.renderScale,
  } as CSSProperties

  return (
    <div className="teleprompter-view" style={rootStyle}>
      <CameraView videoRef={videoRef} devices={devices} currentDeviceId={currentDeviceId} isActive={isActive} isStarting={isStarting} error={cameraError} onStart={() => void handleStartCamera()} onSwitch={deviceId => void handleSwitchCamera(deviceId)} toolbarActions={<button className="camera-btn" onClick={() => { setRecognitionEnabled(false); stopCamera() }}>{isActive ? 'Desligar câmera' : 'Câmera desligada'}</button>}>
        {isActive && (
          <div className="recognition-status-card">
            <strong>{currentCard ? currentCard.nome : 'Reconhecimento ativo'}</strong>
            <span>
              {currentDrawn
                ? `${currentDrawn.isReversed ? 'Invertida' : 'Vertical'}${
                    currentDrawn.confidence
                      ? ` • ${(currentDrawn.confidence * 100).toFixed(1)}%`
                      : ''
                  }`
                : recognitionHint}
            </span>
          </div>
        )}
      </CameraView>

      <div className={`text-overlay ${isPanelExpanded ? 'expanded' : 'collapsed'}`}>
        <button className="tp-panel-toggle" onClick={() => setIsPanelExpanded(prev => !prev)}>
          <span className="tp-panel-toggle-main"><span className="tp-panel-title">{currentPosition ? `${currentPosition.index}. ${currentPosition.nome}` : spread.nome}</span><span className="tp-panel-state">{isPanelExpanded ? 'Ocultar painel' : 'Abrir painel'} • {isActive ? 'Câmera ativa' : 'Câmera desligada'}</span></span>
          <span className="tp-panel-toggle-badges"><span>{drawnCards.length}/{spread.positions.length}</span><span>{settings.wpm} WPM</span><span>{formatTime(elapsedSeconds)}</span></span>
        </button>
        <div className="text-overlay-content">
          <div className="teleprompter-topline"><div><h2>{spread.nome}</h2><p className="position-desc">{currentPosition?.descricao}</p>{consultationSummary && <p className="reading-context">{consultationSummary}</p>}</div><div className="topline-meta"><span>{allPositionsFilled ? 'Completa' : 'Em andamento'}</span><span>{recognitionHint}</span></div></div>
          <div className="card-info"><h1>{currentCard ? currentCard.nome : 'Aguardando carta'}</h1><p className="status">{currentDrawn ? `${currentDrawn.isReversed ? 'Invertida' : 'Vertical'} • ${currentDrawn.source === 'camera' ? 'Câmera' : 'Manual'}` : 'Ative a câmera ou selecione manualmente.'}</p>{currentCard && <div className="card-meta"><p><strong>{formatArcanoLabel(currentCard)}:</strong> {currentCard.arcanoDescricao || formatNaipeElementLabel(currentCard)}</p><p><strong>Significado:</strong> {currentDrawn?.isReversed ? currentCard.significado.invertido.curto : currentCard.significado.vertical.curto}</p></div>}</div>
          <div className="teleprompter-actions"><button onClick={() => setIsScrolling(prev => !prev)}>{isScrolling ? 'Pausar' : 'Iniciar'} rolagem</button><button className="secondary" onClick={goPrevious}>Anterior</button><button className="secondary" onClick={goNext}>Próxima</button><button className="secondary" onClick={() => void (isFullscreen ? exitFullscreen() : enterFullscreen())}>{isFullscreen ? 'Sair tela cheia' : 'Tela cheia'}</button></div>
          <div className="wpm-slider-wrap"><label>Velocidade: {settings.wpm} WPM</label><input type="range" min="40" max="260" value={settings.wpm} onChange={event => setSettings(prev => ({ ...prev, wpm: Number(event.target.value) }))} /></div>
          <div ref={scriptWindowRef} className={`script-window${settings.flipHorizontal ? ' flip-horizontal' : ''}${settings.flipVertical ? ' flip-vertical' : ''}`}>{settings.highlightLine && <div className="focus-line" />}<div className="script-content">{paragraphs.map((paragraph, index) => <p key={`${paragraph.slice(0, 12)}-${index}`} ref={el => { paragraphRefs.current[index] = el }} className={index === activeParagraphIndex ? 'active-line' : ''}>{renderParagraph(paragraph)}</p>)}</div></div>
          <div className="manual-controls"><label>Seleção manual de carta</label><div className="manual-row"><select value={manualCardId} onChange={event => setManualCardId(event.target.value)}><option value="">Escolha uma carta</option>{cards.map(card => <option key={card.id} value={card.id}>{card.nome}</option>)}</select><button className={`secondary${manualIsReversed ? ' active' : ''}`} onClick={() => setManualIsReversed(prev => !prev)}>{manualIsReversed ? 'Invertida' : 'Vertical'}</button><button onClick={handleManualConfirm}>Confirmar</button></div></div>
          <div className="controls"><button className="secondary" onClick={() => setRecognitionEnabled(prev => !prev)} disabled={!isActive}>{recognitionEnabled ? 'Pausar reconhecimento' : 'Ativar reconhecimento'}</button><button className="secondary" onClick={() => setAutoAdvance(prev => !prev)}>{autoAdvance ? 'Avanço automático: on' : 'Avanço automático: off'}</button><button className="secondary" onClick={toggleVoice}>{voiceStatus === 'listening' ? 'Parar voz' : 'Comandos de voz'}</button></div>
          <details className="script-editor"><summary>Editar/importar roteiro</summary><p>Use TXT/MD para ajustar o texto lido no teleprompter.</p><textarea value={scriptText} onChange={event => handleScriptChange(event.target.value)} /><div className="script-editor-actions"><button onClick={handleResetAutoScript}>Restaurar automático</button><button className="secondary" onClick={() => fileInputRef.current?.click()}>Importar TXT/MD</button><button className="secondary" onClick={handleExportScript}>Exportar</button></div><input ref={fileInputRef} type="file" accept=".txt,.md,.markdown" hidden onChange={event => void handleImportScript(event)} /></details>
          <div className="tp-extra-controls-toggle-wrap"><button className={`tp-extra-controls-toggle${isExtraControlsExpanded ? ' expanded' : ''}`} onClick={() => setIsExtraControlsExpanded(prev => !prev)}>+</button></div>
          {isExtraControlsExpanded && <div className="tp-extra-controls"><div className="advanced-panel"><h3>Ajustes avançados</h3><div className="advanced-grid"><label>Fonte<input type="range" min="16" max="56" value={settings.fontSize} onChange={event => setSettings(prev => ({ ...prev, fontSize: Number(event.target.value) }))} /></label><label>Entrelinhas<input type="range" min="1" max="2" step="0.05" value={settings.lineHeight} onChange={event => setSettings(prev => ({ ...prev, lineHeight: Number(event.target.value) }))} /></label><label>Resolução<select value={settings.resolutionPreset} onChange={event => setSettings(prev => ({ ...prev, resolutionPreset: event.target.value as ResolutionPreset }))}><option value="high">Alta</option><option value="medium">Média</option><option value="low">Leve</option></select></label></div></div></div>}
          <div className="synthesis-panel"><h4>Síntese final</h4><textarea value={synthesisText} onChange={event => setSynthesisText(event.target.value)} /><div className="synthesis-actions"><button onClick={() => void navigator.clipboard.writeText(synthesisText)}>Copiar síntese</button></div></div>
          <div className="session-footer"><button onClick={() => void handleSave()} disabled={isSaving}>{isSaving ? 'Salvando...' : 'Salvar sessão'}</button><button className="secondary" onClick={onBack}>Voltar</button>{saveFeedback && <p className="save-feedback">{saveFeedback}</p>}{controlFeedback && <p className="control-feedback">{controlFeedback}</p>}</div>
        </div>
      </div>
    </div>
  )
}

export default TeleprompterView
