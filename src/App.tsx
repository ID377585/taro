import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react'
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
  | 'reading'

interface PersistedFlowState {
  step: FlowStep
  consultationIntake: ConsultationIntake | null
  selectedSpreadId: string | null
}

const FLOW_STORAGE_KEY = 'taro.flow.state.v1'
const toUppercaseDisplay = (value: string) => value.toLocaleUpperCase('pt-BR')

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

function App() {
  const [selectedSpread, setSelectedSpread] = useState<Spread | null>(null)
  const [showSpreadSelector, setShowSpreadSelector] = useState(false)
  const [showIntakeForm, setShowIntakeForm] = useState(false)
  const [showHistoryRecords, setShowHistoryRecords] = useState(false)
  const [isRegisteringCards, setIsRegisteringCards] = useState(false)
  const [consultationIntake, setConsultationIntake] =
    useState<ConsultationIntake | null>(null)
  const [cards, setCards] = useState<Card[]>([])
  const [spreads, setSpreads] = useState<Spread[]>([])
  const [sessions, setSessions] = useState<SpreadingSession[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const hasRestoredFlowRef = useRef(false)

  const { isReady, saveSession, getAllSessions } = useIndexedDB()

  useEffect(() => {
    const loadBaseData = async () => {
      setLoading(true)
      setLoadError(null)

      try {
        const [cardsData, spreadsData] = await Promise.all([
          fetch('/data/cards.json').then(res => res.json() as Promise<CardsDataResponse>),
          fetch('/data/spreads.json').then(
            res => res.json() as Promise<SpreadsDataResponse>,
          ),
        ])

        setCards(cardsData.cards)
        setSpreads(spreadsData.spreads)
      } catch (err) {
        console.error('Erro ao carregar dados:', err)
        setLoadError('Não foi possível carregar os dados de cartas e tiragens.')
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
      const hasIntake = Boolean(parsed.consultationIntake)

      if (parsed.consultationIntake) {
        setConsultationIntake(parsed.consultationIntake)
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
        : showHistoryRecords
          ? 'history'
          : showSpreadSelector
            ? 'spread-selector'
            : showIntakeForm
              ? 'intake'
              : 'home'

    const state: PersistedFlowState = {
      step,
      consultationIntake,
      selectedSpreadId: selectedSpread?.id || null,
    }

    localStorage.setItem(FLOW_STORAGE_KEY, JSON.stringify(state))
  }, [
    consultationIntake,
    isRegisteringCards,
    loading,
    selectedSpread,
    showHistoryRecords,
    showIntakeForm,
    showSpreadSelector,
  ])

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

        {!loading && loadError && <p className="error">{loadError}</p>}

        {!loading &&
          !loadError &&
          !selectedSpread &&
          !isRegisteringCards &&
          !showSpreadSelector &&
          !showIntakeForm &&
          !showHistoryRecords && (
          <>
            <div className="home-menu">
              <h1>Leituras de Tarot</h1>
              <div className="home-actions">
                <button
                  onClick={() => {
                    setIsRegisteringCards(false)
                    setShowSpreadSelector(false)
                    setShowIntakeForm(true)
                    setShowHistoryRecords(false)
                  }}
                >
                  Iniciar Tiragem
                </button>
                <button
                  className="secondary"
                  onClick={() => {
                    setShowIntakeForm(false)
                    setShowSpreadSelector(false)
                    setIsRegisteringCards(true)
                    setShowHistoryRecords(false)
                  }}
                >
                  Registrar Cartas
                </button>
              </div>
            </div>
            <HistoryPanel
              sessions={sessions}
              onOpenAll={() => {
                setShowIntakeForm(false)
                setShowSpreadSelector(false)
                setIsRegisteringCards(false)
                setShowHistoryRecords(true)
              }}
            />
          </>
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
              setConsultationIntake(intake)
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
