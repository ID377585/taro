import { FC, useEffect, useMemo, useRef, useState } from 'react'
import { Card, SpreadingSession, Spread } from '../types'
import {
  buildSessionFullReport,
  buildSessionHtmlReport,
  buildSessionReportFileName,
} from '../services/sessionReportService'
import './HistoryRecordsView.css'

interface HistoryRecordsViewProps {
  sessions: SpreadingSession[]
  cards: Card[]
  spreads: Spread[]
  onBack: () => void
}

const formatDate = (timestamp: number) =>
  new Date(timestamp).toLocaleString('pt-BR')

const downloadTextFile = (content: string, fileName: string, mimeType: string) => {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

const openHtmlReport = (html: string) => {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const win = window.open(url, '_blank', 'noopener,noreferrer')

  if (!win) {
    downloadTextFile(html, 'relatorio-leitura.html', 'text/html;charset=utf-8')
  }

  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

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

  const selectedSpread = selectedSession
    ? spreadById.get(selectedSession.spreadId) || null
    : null

  const reportText = useMemo(() => {
    if (!selectedSession) return ''

    return buildSessionFullReport({
      session: selectedSession,
      spread: spreadById.get(selectedSession.spreadId) || null,
      cardById: cardsById,
    })
  }, [cardsById, selectedSession, spreadById])

  const htmlReport = useMemo(() => {
    if (!selectedSession) return ''

    return buildSessionHtmlReport({
      session: selectedSession,
      spread: selectedSpread,
      cardById: cardsById,
    })
  }, [cardsById, selectedSession, selectedSpread])

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

  const showFeedback = (message: string) => {
    setCopyFeedback(message)
    if (copyTimerRef.current) {
      window.clearTimeout(copyTimerRef.current)
    }
    copyTimerRef.current = window.setTimeout(() => {
      setCopyFeedback('')
    }, 2400)
  }

  const handleCopyAll = async () => {
    if (!reportText) return

    if (reportRef.current) {
      reportRef.current.focus()
      reportRef.current.select()
      reportRef.current.setSelectionRange(0, reportRef.current.value.length)
    }

    try {
      await navigator.clipboard.writeText(reportText)
      showFeedback('Texto copiado')
    } catch {
      showFeedback('Falha ao copiar texto')
    }
  }

  const handleOpenPrintable = () => {
    if (!htmlReport) return
    openHtmlReport(htmlReport)
    showFeedback('Relatório aberto para impressão/PDF')
  }

  const handleDownloadHtml = () => {
    if (!htmlReport || !selectedSession) return
    downloadTextFile(
      htmlReport,
      buildSessionReportFileName(selectedSession),
      'text/html;charset=utf-8',
    )
    showFeedback('Arquivo HTML baixado')
  }

  const handleShareText = async () => {
    if (!reportText) return

    try {
      if (navigator.share) {
        await navigator.share({
          title: 'Relatório de leitura de tarô',
          text: reportText,
        })
        showFeedback('Compartilhamento iniciado')
        return
      }

      await navigator.clipboard.writeText(reportText)
      showFeedback('Compartilhamento indisponível; texto copiado')
    } catch {
      showFeedback('Não foi possível compartilhar')
    }
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
                Copiar texto
              </button>
              <button onClick={handleOpenPrintable}>
                Abrir PDF/Impressão
              </button>
              <button onClick={handleDownloadHtml}>
                Baixar HTML
              </button>
              <button onClick={() => void handleShareText()}>
                Compartilhar
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
