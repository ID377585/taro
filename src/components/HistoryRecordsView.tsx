import { FC, useEffect, useMemo, useRef, useState } from 'react'
import { Card, SpreadingSession, Spread } from '../types'
import { buildSessionFullReport } from '../services/sessionReportService'
import './HistoryRecordsView.css'

interface HistoryRecordsViewProps {
  sessions: SpreadingSession[]
  cards: Card[]
  spreads: Spread[]
  onBack: () => void
}

const formatDate = (timestamp: number) =>
  new Date(timestamp).toLocaleString('pt-BR')

const HistoryRecordsView: FC<HistoryRecordsViewProps> = ({
  sessions,
  cards,
  spreads,
  onBack,
}) => {
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    sessions[0]?.id || null,
  )
  const [copyFeedback, setCopyFeedback] = useState('')
  const copyTimerRef = useRef<number | null>(null)
  const reportRef = useRef<HTMLTextAreaElement>(null)

  const cardsById = useMemo(() => new Map(cards.map(card => [card.id, card])), [cards])
  const spreadById = useMemo(
    () => new Map(spreads.map(spread => [spread.id, spread])),
    [spreads],
  )

  const selectedSession = useMemo(
    () => sessions.find(session => session.id === selectedSessionId) || sessions[0] || null,
    [selectedSessionId, sessions],
  )

  const reportText = useMemo(() => {
    if (!selectedSession) return ''

    return buildSessionFullReport({
      session: selectedSession,
      spread: spreadById.get(selectedSession.spreadId) || null,
      cardById: cardsById,
    })
  }, [cardsById, selectedSession, spreadById])

  useEffect(() => {
    if (sessions.length === 0) {
      setSelectedSessionId(null)
      return
    }

    const exists = sessions.some(session => session.id === selectedSessionId)
    if (!exists) {
      setSelectedSessionId(sessions[0].id)
    }
  }, [selectedSessionId, sessions])

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) {
        window.clearTimeout(copyTimerRef.current)
      }
    }
  }, [])

  const handleCopyAll = async () => {
    if (!reportText) return

    if (reportRef.current) {
      reportRef.current.focus()
      reportRef.current.select()
      reportRef.current.setSelectionRange(0, reportRef.current.value.length)
    }

    try {
      await navigator.clipboard.writeText(reportText)
      setCopyFeedback('Texto copiado')
    } catch {
      setCopyFeedback('Falha ao copiar texto')
    }

    if (copyTimerRef.current) {
      window.clearTimeout(copyTimerRef.current)
    }

    copyTimerRef.current = window.setTimeout(() => {
      setCopyFeedback('')
    }, 2000)
  }

  return (
    <div className="history-records-view">
      <div className="history-records-header">
        <div>
          <h2>Todos os Históricos de Leitura</h2>
          <p>
            Selecione uma sessão para visualizar o texto completo estruturado por blocos,
            incluindo a síntese final.
          </p>
        </div>
        <button className="secondary" onClick={onBack}>
          Voltar ao menu
        </button>
      </div>

      {sessions.length === 0 && (
        <div className="history-records-empty">
          <p>Nenhum registro de tiragem foi salvo ainda.</p>
        </div>
      )}

      {sessions.length > 0 && (
        <div className="history-records-layout">
          <aside className="history-records-list">
            {sessions.map(session => {
              const isActive = session.id === selectedSession?.id
              const intakeName =
                session.intake?.tipo === 'pessoal'
                  ? session.intake.pessoa1.nomeCompleto
                  : session.intake
                    ? `${session.intake.pessoa1.nomeCompleto} + ${session.intake.pessoa2?.nomeCompleto || 'Pessoa 2'}`
                    : 'Sem nome cadastrado'

              return (
                <button
                  key={session.id}
                  className={`history-record-item${isActive ? ' active' : ''}`}
                  onClick={() => setSelectedSessionId(session.id)}
                >
                  <strong>{session.spreadName}</strong>
                  <small>{formatDate(session.timestamp)}</small>
                  <span>{intakeName}</span>
                </button>
              )
            })}
          </aside>

          <section className="history-records-detail">
            <div className="history-records-detail-actions">
              <button onClick={() => void handleCopyAll()}>
                Selecionar e copiar texto completo
              </button>
              {copyFeedback && <span>{copyFeedback}</span>}
            </div>

            <textarea ref={reportRef} value={reportText} readOnly />
          </section>
        </div>
      )}
    </div>
  )
}

export default HistoryRecordsView
