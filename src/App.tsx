import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import SpreadSelector from './components/SpreadSelector'
import HistoryPanel from './components/HistoryPanel'
import ConsultationIntakeForm from './components/ConsultationIntakeForm'
import {
  DrawnCard,
  Spread,
  Card,
  SpreadingSession,
  ConsultationIntake,
} from './types'
import { useIndexedDB } from './hooks/useIndexedDB'

const TeleprompterView = lazy(() => import('./components/TeleprompterView'))
const HistoryRecordsView = lazy(() => import('./components/HistoryRecordsView'))
const CardRegistrationView = lazy(() => import('./components/CardRegistrationView'))

interface CardsDataResponse {
  cards: Card[]
}

interface SpreadsDataResponse {
  spreads: Spread[]
}

type FlowStep =
  | 'home'
  | 'intake'
  | 'spread-selector'
  | 'history'
  | 'register-cards'
  | 'diagnostics'
  | 'reading'

interface PersistedFlowState {
  step: FlowStep
  consultationIntake: ConsultationIntake | null
  selectedSpreadId: string | null
}

interface DiagnosticItem {
  label: string
  status: 'ok' | 'warning' | 'error'
  detail: string
}

const FLOW_STORAGE_KEY = 'taro.flow.state.v1'
const toUppercaseDisplay = (value: string) => value.toLocaleUpperCase('pt-BR')

const fetchJson = async <T,>(url: string): Promise<T> => {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Falha ao carregar ${url}: HTTP ${response.status}`)
  }
  return response.json() as Promise<T>
}

const formatBirthDate = (raw?: string) => {
  if (!raw) return null
  const [year, month, day] = raw.split('-')
  if (!year || !month || !day) return raw
  return `${day}/${month}/${year}`
}

const formatSexLabel = (sex: 'masculino' | 'feminino') =>
  sex === 'feminino' ? 'FEMININO' : 'MASCULINO'

const formatPersonContext = (
  person: ConsultationIntake['pessoa1'] | ConsultationIntake['pessoa2'] | null | undefined,
  fallbackLabel: string,
) => {
  if (!person) return fallbackLabel
  const name = toUppercaseDisplay(person.nomeCompleto || fallbackLabel)
  const birthDate = formatBirthDate(person.dataNascimento)
  return `${name} (${formatSexLabel(person.sexo)}${birthDate ? `, NASC.: ${birthDate}` : ''})`
}

const normalizeConsultationIntake = (
  intake: ConsultationIntake | null | undefined,
): ConsultationIntake | null => {
  if (!intake) return null

  const normalizePerson = (
    person: ConsultationIntake['pessoa1'] | ConsultationIntake['pessoa2'] | null | undefined,
  ) => {
    if (!person) return null
    return {
      ...person,
      nomeCompleto: toUppercaseDisplay((person.nomeCompleto || '').trim()),
    }
  }

  const normalizedPerson1 = normalizePerson(intake.pessoa1)
  if (!normalizedPerson1) return null

  const normalizedPerson2 =
    intake.tipo === 'sobre-outra-pessoa' ? normalizePerson(intake.pessoa2) : null

  return {
    ...intake,
    pessoa1: normalizedPerson1,
    pessoa2: normalizedPerson2,
    situacaoPrincipal: toUppercaseDisplay((intake.situacaoPrincipal || '').trim()),
  }
}

function App() {
  const [selectedSpread, setSelectedSpread] = useState<Spread | null>(null)
  const [showSpreadSelector, setShowSpreadSelector] = useState(false)
  const [showIntakeForm, setShowIntakeForm] = useState(false)
  const [showHistoryRecords, setShowHistoryRecords] = useState(false)
  const [showDiagnostics, setShowDiagnostics] = useState(false)
  const [isRegisteringCards, setIsRegisteringCards] = useState(false)
  const [consultationIntake, setConsultationIntake] =
    useState<ConsultationIntake | null>(null)
  const [cards, setCards] = useState<Card[]>([])
  const [spreads, setSpreads] = useState<Spread[]>([])
  const [sessions, setSessions] = useState<SpreadingSession[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loadErrorDetail, setLoadErrorDetail] = useState<string | null>(null)
  const hasRestoredFlowRef = useRef(false)

  const { isReady, saveSession, getAllSessions } = useIndexedDB()

  useEffect(() => {
    const loadBaseData = async () => {
      setLoading(true)
      setLoadError(null)
      setLoadErrorDetail(null)

      try {
        const [cardsData, spreadsData] = await Promise.all([
          fetchJson<CardsDataResponse>('/data/cards.json'),
          fetchJson<SpreadsDataResponse>('/data/spreads.json'),
        ])

        if (!Array.isArray(cardsData.cards) || cardsData.cards.length === 0) {
          throw new Error('Arquivo /data/cards.json sem lista de cartas valida.')
        }
        if (!Array.isArray(spreadsData.spreads) || spreadsData.spreads.length === 0) {
          throw new Error('Arquivo /data/spreads.json sem lista de tiragens valida.')
        }

        setCards(cardsData.cards)
        setSpreads(spreadsData.spreads)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erro desconhecido.'
        console.error('Erro ao carregar dados:', err)
        setLoadError('Não foi possível carregar os dados de cartas e tiragens.')
        setLoadErrorDetail(message)
      } finally {
        setLoading(false)
      }
    }

    void loadBaseData()
  }, [])

  const refreshSessions = useCallback(async () => {
    if (!isReady) return
    const allSessions = await getAllSessions()
    const sorted = allSessions.sort((a, b) => b.timestamp - a.timestamp)
    setSessions(sorted)
  }, [getAllSessions, isReady])

  useEffect(() => {
    void refreshSessions()
  }, [refreshSessions])

  useEffect(() => {
    if (loading || hasRestoredFlowRef.current) return

    hasRestoredFlowRef.current = true
    try {
      const raw = localStorage.getItem(FLOW_STORAGE_KEY)
      if (!raw) return

      const parsed = JSON.parse(raw) as PersistedFlowState
      const normalizedIntake = normalizeConsultationIntake(parsed.consultationIntake)
      const hasIntake = Boolean(normalizedIntake)

      if (normalizedIntake) {
        setConsultationIntake(normalizedIntake)
      }

      if (parsed.step === 'reading') {
        if (!hasIntake) {
          setShowIntakeForm(true)
          return
        }
        if (parsed.selectedSpreadId) {
          const spread = spreads.find(item => item.id === parsed.selectedSpreadId)
          if (spread) {
            setSelectedSpread(spread)
            return
          }
        }
        setShowSpreadSelector(true)
        return
      }

      if (parsed.step === 'spread-selector') {
        if (hasIntake) {
          setShowSpreadSelector(true)
        } else {
          setShowIntakeForm(true)
        }
        return
      }

      if (parsed.step === 'intake') {
        setShowIntakeForm(true)
        return
      }

      if (parsed.step === 'register-cards') {
        setIsRegisteringCards(true)
        return
      }

      if (parsed.step === 'diagnostics') {
        setShowDiagnostics(true)
        return
      }

      if (parsed.step === 'history') {
        setShowHistoryRecords(true)
      }
    } catch (error) {
      console.error('Falha ao restaurar fluxo:', error)
    }
  }, [loading, spreads])

  useEffect(() => {
    if (loading || !hasRestoredFlowRef.current) return

    const step: FlowStep = selectedSpread
      ? 'reading'
      : isRegisteringCards
        ? 'register-cards'
        : showDiagnostics
          ? 'diagnostics'
          : showHistoryRecords
            ? 'history'
            : showSpreadSelector
              ? 'spread-selector'
              : showIntakeForm
                ? 'intake'
                : 'home'

    const state: PersistedFlowState = {
      step,
      consultationIntake: normalizeConsultationIntake(consultationIntake),
      selectedSpreadId: selectedSpread?.id || null,
    }

    localStorage.setItem(FLOW_STORAGE_KEY, JSON.stringify(state))
  }, [
    consultationIntake,
    isRegisteringCards,
    loading,
    selectedSpread,
    showDiagnostics,
    showHistoryRecords,
    showIntakeForm,
    showSpreadSelector,
  ])

  const diagnostics = useMemo<DiagnosticItem[]>(() => {
    const secureContext = window.isSecureContext
    const hasCameraApi = Boolean(navigator.mediaDevices?.getUserMedia)
    const hasIndexedDb = Boolean(window.indexedDB)
    const hasServiceWorker = 'serviceWorker' in navigator
    const hasSpeechRecognition =
      'SpeechRecognition' in window || 'webkitSpeechRecognition' in window
    const hasWakeLock = 'wakeLock' in navigator

    return [
      {
        label: 'Base de cartas',
        status: cards.length > 0 ? 'ok' : 'error',
        detail: cards.length > 0 ? `${cards.length} cartas carregadas.` : 'Cartas não carregadas.',
      },
      {
        label: 'Tiragens',
        status: spreads.length > 0 ? 'ok' : 'error',
        detail:
          spreads.length > 0 ? `${spreads.length} tiragens carregadas.` : 'Tiragens não carregadas.',
      },
      {
        label: 'IndexedDB',
        status: hasIndexedDb && isReady ? 'ok' : hasIndexedDb ? 'warning' : 'error',
        detail: hasIndexedDb
          ? isReady
            ? 'Histórico e capturas locais disponíveis.'
            : 'Banco local detectado, ainda inicializando.'
          : 'Este navegador não oferece IndexedDB.',
      },
      {
        label: 'Câmera',
        status: secureContext && hasCameraApi ? 'ok' : hasCameraApi ? 'warning' : 'error',
        detail: secureContext
          ? hasCameraApi
            ? 'API de câmera disponível neste contexto seguro.'
            : 'API de câmera indisponível neste navegador.'
          : 'Use HTTPS para liberar a câmera em produção.',
      },
      {
        label: 'PWA / Service Worker',
        status: hasServiceWorker ? 'ok' : 'warning',
        detail: hasServiceWorker
          ? 'Navegador compatível com instalação/cache offline.'
          : 'Service Worker indisponível neste navegador.',
      },
      {
        label: 'Comandos de voz',
        status: hasSpeechRecognition ? 'ok' : 'warning',
        detail: hasSpeechRecognition
          ? 'Reconhecimento de voz suportado pelo navegador.'
          : 'Navegador sem suporte a reconhecimento de voz.',
      },
      {
        label: 'Wake lock',
        status: hasWakeLock ? 'ok' : 'warning',
        detail: hasWakeLock
          ? 'Pode manter a tela ativa durante a leitura.'
          : 'A tela pode apagar conforme configuração do aparelho.',
      },
      {
        label: 'Modelo de IA',
        status: 'warning',
        detail: 'Verifique em Registrar/Leitura se public/model contém o modelo final de 156 classes.',
      },
    ]
  }, [cards.length, isReady, spreads.length])

  const closeAllViews = () => {
    setSelectedSpread(null)
    setShowIntakeForm(false)
    setShowSpreadSelector(false)
    setShowHistoryRecords(false)
    setShowDiagnostics(false)
    setIsRegisteringCards(false)
  }

  const handleSaveSession = async (drawnCards: DrawnCard[]) => {
    if (!selectedSpread) return

    const session: SpreadingSession = {
      id: crypto.randomUUID(),
      spreadId: selectedSpread.id,
      spreadName: selectedSpread.nome,
      timestamp: Date.now(),
      drawnCards,
      intake: consultationIntake || undefined,
    }

    await saveSession(session)
    await refreshSessions()
  }

  return (
    <div className="app">
      <div
        className={`app-container${
          selectedSpread || isRegisteringCards ? ' app-container--teleprompter' : ''
        }`}
      >
        {loading && <p className="loading">Carregando conteúdo...</p>}

        {!loading && loadError && (
          <div className="error error-card">
            <strong>{loadError}</strong>
            {loadErrorDetail && <small>Detalhe técnico: {loadErrorDetail}</small>}
          </div>
        )}

        {!loading &&
          !loadError &&
          !selectedSpread &&
          !isRegisteringCards &&
          !showSpreadSelector &&
          !showIntakeForm &&
          !showHistoryRecords &&
          !showDiagnostics && (
          <>
            <div className="home-menu">
              <h1>Leituras de Tarot</h1>
              <p>Teleprompter, registro de cartas e histórico local para atendimentos.</p>
              <div className="home-actions">
                <button
                  onClick={() => {
                    closeAllViews()
                    setShowIntakeForm(true)
                  }}
                >
                  Iniciar Tiragem
                </button>
                <button
                  className="secondary"
                  onClick={() => {
                    closeAllViews()
                    setIsRegisteringCards(true)
                  }}
                >
                  Registrar Cartas
                </button>
                <button
                  className="secondary"
                  onClick={() => {
                    closeAllViews()
                    setShowDiagnostics(true)
                  }}
                >
                  Diagnóstico
                </button>
              </div>
            </div>
            <HistoryPanel
              sessions={sessions}
              onOpenAll={() => {
                closeAllViews()
                setShowHistoryRecords(true)
              }}
            />
          </>
        )}

        {!loading && !loadError && !selectedSpread && showDiagnostics && (
          <section className="diagnostics-panel">
            <div className="diagnostics-header">
              <div>
                <h2>Diagnóstico do sistema</h2>
                <p>Confira rapidamente se o navegador está pronto para atendimento.</p>
              </div>
              <button className="secondary" onClick={closeAllViews}>Voltar</button>
            </div>
            <div className="diagnostics-grid">
              {diagnostics.map(item => (
                <article className={`diagnostic-card diagnostic-card--${item.status}`} key={item.label}>
                  <span>{item.status === 'ok' ? 'OK' : item.status === 'warning' ? 'Atenção' : 'Erro'}</span>
                  <h3>{item.label}</h3>
                  <p>{item.detail}</p>
                </article>
              ))}
            </div>
          </section>
        )}

        {!loading && !loadError && !selectedSpread && showHistoryRecords && (
          <Suspense fallback={<p className="loading">Carregando módulo...</p>}>
            <HistoryRecordsView
              sessions={sessions}
              cards={cards}
              spreads={spreads}
              onBack={() => setShowHistoryRecords(false)}
            />
          </Suspense>
        )}

        {!loading && !loadError && !selectedSpread && showIntakeForm && (
          <ConsultationIntakeForm
            initialValue={consultationIntake}
            onSubmit={intake => {
              const normalizedIntake = normalizeConsultationIntake(intake)
              setConsultationIntake(normalizedIntake)
              setShowIntakeForm(false)
              setShowSpreadSelector(true)
            }}
            onBack={() => setShowIntakeForm(false)}
          />
        )}

        {!loading && !loadError && !selectedSpread && showSpreadSelector && (
          <>
            {consultationIntake && (
              <div className="active-reading-context">
                <h3>Atendimento registrado</h3>
                <p>
                  {consultationIntake.tipo === 'pessoal'
                    ? `Pessoal: ${formatPersonContext(consultationIntake.pessoa1, 'PESSOA 1')}.`
                    : `Sobre outra pessoa: ${formatPersonContext(
                        consultationIntake.pessoa1,
                        'PESSOA 1',
                      )} e ${formatPersonContext(consultationIntake.pessoa2, 'PESSOA 2')}.`}
                </p>
                <small>
                  Situação: {toUppercaseDisplay(consultationIntake.situacaoPrincipal)}
                </small>
              </div>
            )}
            <SpreadSelector spreads={spreads} onSelect={setSelectedSpread} />
            <div className="home-actions home-actions--compact">
              <button
                className="secondary"
                onClick={() => {
                  setShowSpreadSelector(false)
                  setShowIntakeForm(true)
                }}
              >
                Editar dados iniciais
              </button>
              <button
                className="secondary"
                onClick={() => {
                  setShowSpreadSelector(false)
                }}
              >
                Voltar ao menu
              </button>
            </div>
          </>
        )}

        {!loading && !loadError && selectedSpread && (
          <Suspense fallback={<p className="loading">Carregando módulo...</p>}>
            <TeleprompterView
              spread={selectedSpread}
              cards={cards}
              consultation={consultationIntake}
              onBack={() => {
                setSelectedSpread(null)
                setShowSpreadSelector(true)
              }}
              onSaveSession={handleSaveSession}
            />
          </Suspense>
        )}

        {!loading && !loadError && !selectedSpread && isRegisteringCards && (
          <Suspense fallback={<p className="loading">Carregando módulo...</p>}>
            <CardRegistrationView
              cards={cards}
              onBack={() => setIsRegisteringCards(false)}
            />
          </Suspense>
        )}
      </div>
    </div>
  )
}

export default App
