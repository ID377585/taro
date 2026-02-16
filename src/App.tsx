import { useCallback, useEffect, useRef, useState } from 'react'
import './App.css'
import SpreadSelector from './components/SpreadSelector'
import TeleprompterView from './components/TeleprompterView'
import HistoryPanel from './components/HistoryPanel'
import HistoryRecordsView from './components/HistoryRecordsView'
import CardRegistrationView from './components/CardRegistrationView'
import ConsultationIntakeForm from './components/ConsultationIntakeForm'
import {
  DrawnCard,
  Spread,
  Card,
  SpreadingSession,
  ConsultationIntake,
} from './types'
import { useIndexedDB } from './hooks/useIndexedDB'

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
              <h1>Tarô Teleprompter</h1>
              <p>
                Escolha entre iniciar uma tiragem em modo teleprompter ou registrar
                novas imagens de cartas para treino do modelo.
              </p>
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
          <HistoryRecordsView
            sessions={sessions}
            cards={cards}
            spreads={spreads}
            onBack={() => setShowHistoryRecords(false)}
          />
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
                    ? `Pessoal: ${consultationIntake.pessoa1.nomeCompleto}.`
                    : `Sobre outra pessoa: ${consultationIntake.pessoa1.nomeCompleto} e ${consultationIntake.pessoa2?.nomeCompleto || 'Pessoa 2'}.`}
                </p>
                <small>Situação: {consultationIntake.situacaoPrincipal}</small>
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
        )}

        {!loading && !loadError && !selectedSpread && isRegisteringCards && (
          <CardRegistrationView
            cards={cards}
            onBack={() => setIsRegisteringCards(false)}
          />
        )}
      </div>
    </div>
  )
}

export default App
