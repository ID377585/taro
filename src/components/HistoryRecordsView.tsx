import { ChangeEvent, FC, useEffect, useMemo, useRef, useState } from 'react'
import { Card, SpreadingSession, Spread } from '../types'
import {
  buildSessionFullReport,
  buildSessionHtmlReport,
  buildSessionReportFileName,
} from '../services/sessionReportService'
import {
  buildSessionBackupFileName,
  parseSessionBackup,
  stringifySessionBackup,
} from '../services/sessionBackupService'
import './HistoryRecordsView.css'

interface HistoryRecordsViewProps {
  sessions: SpreadingSession[]
  cards: Card[]
  spreads: Spread[]
  onBack: () => void
  onImportSessions: (sessions: SpreadingSession[]) => Promise<void>
  onDeleteSession: (sessionId: string) => Promise<void>
}

const formatDate = (timestamp: number) =>
  new Date(timestamp).toLocaleString('pt-BR')

const normalizeText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()

const getPrimaryClientName = (session: SpreadingSession) =>
  session.intake?.pessoa1.nomeCompleto || 'Sem nome cadastrado'

const getSecondaryClientName = (session: SpreadingSession) =>
  session.intake?.tipo === 'sobre-outra-pessoa'
    ? session.intake.pessoa2?.nomeCompleto || 'Pessoa 2'
    : ''

const getIntakeDisplayName = (session: SpreadingSession) => {
  const first = getPrimaryClientName(session)
  const second = getSecondaryClientName(session)
  return second ? `${first} + ${second}` : first
}

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
  onImportSessions,
  onDeleteSession,
}) => {
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    sessions[0]?.id || null,
  )
  const [copyFeedback, setCopyFeedback] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [clientFilter, setClientFilter] = useState('all')
  const copyTimerRef = useRef<number | null>(null)
  const reportRef = useRef<HTMLTextAreaElement>(null)
  const backupInputRef = useRef<HTMLInputElement>(null)

  const cardsById = useMemo(() => new Map(cards.map(card => [card.id, card])), [cards])
  const spreadById = useMemo(
    () => new Map(spreads.map(spread => [spread.id, spread])),
    [spreads],
  )

  const clientSummaries = useMemo(() => {
    const map = new Map<string, {
      name: string
      normalizedName: string
      sessions: SpreadingSession[]
      lastTimestamp: number
      topics: Set<string>
    }>()

    sessions.forEach(session => {
      const name = getPrimaryClientName(session)
      const normalizedName = normalizeText(name)
      const key = normalizedName || 'sem-nome'
      const current = map.get(key) || {
        name,
        normalizedName,
        sessions: [],
        lastTimestamp: 0,
        topics: new Set<string>(),
      }

      current.sessions.push(session)
      current.lastTimestamp = Math.max(current.lastTimestamp, session.timestamp)
      if (session.intake?.situacaoPrincipal) {
        current.topics.add(session.intake.situacaoPrincipal)
      }
      map.set(key, current)
    })

    return Array.from(map.values()).sort((a, b) => b.lastTimestamp - a.lastTimestamp)
  }, [sessions])

  const filteredSessions = useMemo(() => {
    const normalizedSearch = normalizeText(searchTerm)

    return sessions.filter(session => {
      const primary = getPrimaryClientName(session)
      const secondary = getSecondaryClientName(session)
      const searchable = normalizeText([
        primary,
        secondary,
        session.spreadName,
        session.intake?.situacaoPrincipal || '',
        new Date(session.timestamp).toLocaleDateString('pt-BR'),
      ].join(' '))

      const matchesSearch = !normalizedSearch || searchable.includes(normalizedSearch)
      const matchesClient = clientFilter === 'all' || normalizeText(primary) === clientFilter

      return matchesSearch && matchesClient
    })
  }, [clientFilter, searchTerm, sessions])

  const selectedSession = useMemo(
    () =>
      filteredSessions.find(session => session.id === selectedSessionId) ||
      sessions.find(session => session.id === selectedSessionId) ||
      filteredSessions[0] ||
      sessions[0] ||
      null,
    [filteredSessions, selectedSessionId, sessions],
  )

  const selectedSpread = selectedSession
    ? spreadById.get(selectedSession.spreadId) || null
    : null

  const selectedClientSummary = selectedSession
    ? clientSummaries.find(
        summary => summary.normalizedName === normalizeText(getPrimaryClientName(selectedSession)),
      ) || null
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

    const exists = filteredSessions.some(session => session.id === selectedSessionId)
    if (!exists) {
      setSelectedSessionId(filteredSessions[0]?.id || sessions[0].id)
    }
  }, [filteredSessions, selectedSessionId, sessions])

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

  const handleDownloadBackup = () => {
    downloadTextFile(
      stringifySessionBackup(sessions),
      buildSessionBackupFileName(),
      'application/json;charset=utf-8',
    )
    showFeedback('Backup JSON baixado')
  }

  const handleImportBackup = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    try {
      const raw = await file.text()
      const importedSessions = parseSessionBackup(raw)
      await onImportSessions(importedSessions)
      showFeedback(`${importedSessions.length} sessão(ões) importada(s)`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha ao importar backup.'
      showFeedback(message)
    }
  }

  const handleDeleteSelected = async () => {
    if (!selectedSession) return

    const confirmed = window.confirm(
      `Excluir a leitura "${selectedSession.spreadName}" de ${formatDate(selectedSession.timestamp)}?`,
    )
    if (!confirmed) return

    try {
      await onDeleteSession(selectedSession.id)
      showFeedback('Sessão excluída')
    } catch {
      showFeedback('Falha ao excluir sessão')
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
        <div className="history-header-actions">
          <button className="secondary" onClick={handleDownloadBackup}>
            Backup JSON
          </button>
          <button className="secondary" onClick={() => backupInputRef.current?.click()}>
            Importar JSON
          </button>
          <button className="secondary" onClick={onBack}>
            Voltar ao menu
          </button>
          {copyFeedback && <span>{copyFeedback}</span>}
          <input
            ref={backupInputRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={event => void handleImportBackup(event)}
          />
        </div>
      </div>

      {sessions.length === 0 && (
        <div className="history-records-empty">
          <p>Nenhum registro de tiragem foi salvo ainda.</p>
        </div>
      )}

      {sessions.length > 0 && (
        <>
          <div className="history-crm-summary">
            <article>
              <span>Consulentes</span>
              <strong>{clientSummaries.length}</strong>
            </article>
            <article>
              <span>Consultas salvas</span>
              <strong>{sessions.length}</strong>
            </article>
            <article>
              <span>Consultas filtradas</span>
              <strong>{filteredSessions.length}</strong>
            </article>
            <article>
              <span>Última consulta</span>
              <strong>{formatDate(sessions[0].timestamp).split(',')[0]}</strong>
            </article>
          </div>

          <div className="history-filters">
            <label>
              Buscar
              <input
                value={searchTerm}
                onChange={event => setSearchTerm(event.target.value)}
                placeholder="Nome, situação, tiragem ou data"
              />
            </label>
            <label>
              Consulente
              <select
                value={clientFilter}
                onChange={event => setClientFilter(event.target.value)}
              >
                <option value="all">Todos</option>
                {clientSummaries.map(summary => (
                  <option key={summary.normalizedName || 'sem-nome'} value={summary.normalizedName}>
                    {summary.name} ({summary.sessions.length})
                  </option>
                ))}
              </select>
            </label>
          </div>

          {selectedClientSummary && (
            <section className="client-profile-card">
              <div>
                <span>Perfil do consulente</span>
                <h3>{selectedClientSummary.name}</h3>
                <p>
                  {selectedClientSummary.sessions.length} consulta(s) registrada(s). Última em{' '}
                  {formatDate(selectedClientSummary.lastTimestamp)}.
                </p>
              </div>
              <div className="client-topic-list">
                {Array.from(selectedClientSummary.topics).slice(0, 4).map(topic => (
                  <small key={topic}>{topic}</small>
                ))}
              </div>
            </section>
          )}

          <div className="history-records-layout">
            <aside className="history-records-list">
              {filteredSessions.map(session => {
                const isActive = session.id === selectedSession?.id
                const intakeName = getIntakeDisplayName(session)

                return (
                  <button
                    key={session.id}
                    className={`history-record-item${isActive ? ' active' : ''}`}
                    onClick={() => setSelectedSessionId(session.id)}
                  >
                    <strong>{session.spreadName}</strong>
                    <small>{formatDate(session.timestamp)}</small>
                    <span>{intakeName}</span>
                    {session.intake?.situacaoPrincipal && (
                      <em>{session.intake.situacaoPrincipal}</em>
                    )}
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
                <button
                  className="danger"
                  onClick={() => void handleDeleteSelected()}
                  disabled={!selectedSession}
                >
                  Excluir sessão
                </button>
              </div>

              {filteredSessions.length === 0 ? (
                <div className="history-records-empty">
                  <p>Nenhuma leitura encontrada para os filtros atuais.</p>
                </div>
              ) : (
                <textarea ref={reportRef} value={reportText} readOnly />
              )}
            </section>
          </div>
        </>
      )}
    </div>
  )
}

export default HistoryRecordsView
