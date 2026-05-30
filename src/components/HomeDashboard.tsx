import { FC } from 'react'
import HistoryPanel from './HistoryPanel'
import { SpreadingSession } from '../types'

interface SavedFlowInfo {
  hasSavedFlow: boolean
  onContinue: () => void
  onClear: () => void
}

interface HomeDashboardProps {
  sessions: SpreadingSession[]
  cardsCount: number
  spreadsCount: number
  progressPercent: number
  isReady: boolean
  hasCameraApi: boolean
  hasServiceWorker: boolean
  savedFlow: SavedFlowInfo
  onStartReading: () => void
  onOpenHistory: () => void
  onRegisterCards: () => void
  onOpenOperations: () => void
  onOpenDiagnostics: () => void
}

const formatLastSessionDate = (sessions: SpreadingSession[]) => {
  const last = sessions[0]
  if (!last) return 'Nenhuma ainda'
  return new Date(last.timestamp).toLocaleDateString('pt-BR')
}

const HomeDashboard: FC<HomeDashboardProps> = ({
  sessions,
  cardsCount,
  spreadsCount,
  progressPercent,
  isReady,
  hasCameraApi,
  hasServiceWorker,
  savedFlow,
  onStartReading,
  onOpenHistory,
  onRegisterCards,
  onOpenOperations,
  onOpenDiagnostics,
}) => {
  return (
    <div className="home-dashboard">
      <section className="home-menu">
        <span className="home-kicker">Tarot profissional</span>
        <h1>Centro de atendimento e leituras</h1>
        <p>
          Conduza consultas com teleprompter, histórico local, relatórios profissionais,
          cadastro de consulentes e recursos de reconhecimento de cartas.
        </p>

        <div className="home-hero-stats">
          <article>
            <strong>{sessions.length}</strong>
            <span>consultas salvas</span>
          </article>
          <article>
            <strong>{spreadsCount}</strong>
            <span>tiragens disponíveis</span>
          </article>
          <article>
            <strong>{cardsCount}</strong>
            <span>cartas no catálogo</span>
          </article>
        </div>

        {savedFlow.hasSavedFlow && (
          <div className="resume-card">
            <div>
              <strong>Atividade salva encontrada</strong>
              <p>Continue a última atividade apenas quando quiser. Nada abre automaticamente.</p>
            </div>
            <div className="home-actions home-actions--compact">
              <button onClick={savedFlow.onContinue}>Continuar atividade</button>
              <button className="secondary" onClick={savedFlow.onClear}>Descartar</button>
            </div>
          </div>
        )}
      </section>

      <section className="home-grid" aria-label="Ações principais">
        <button className="home-action-card primary" onClick={onStartReading}>
          <em>🃏</em>
          <span>
            <strong>Nova consulta</strong>
            <span>Inicie um atendimento completo com dados do consulente e tiragem.</span>
          </span>
        </button>

        <button className="home-action-card" onClick={onOpenHistory}>
          <em>📚</em>
          <span>
            <strong>Histórico</strong>
            <span>Consulte leituras salvas, exporte PDF e acompanhe recorrências.</span>
          </span>
        </button>

        <button className="home-action-card" onClick={onRegisterCards}>
          <em>📸</em>
          <span>
            <strong>Registrar cartas</strong>
            <span>Cadastre imagens e organize a base visual para reconhecimento.</span>
          </span>
        </button>

        <button className="home-action-card" onClick={onOpenOperations}>
          <em>⚙️</em>
          <span>
            <strong>Operações</strong>
            <span>Veja progresso, fila local, sincronização e saúde operacional.</span>
          </span>
        </button>
      </section>

      <section className="home-section-card">
        <h2>Status do sistema</h2>
        <p>Resumo rápido para saber se o app está pronto para atendimento no aparelho atual.</p>
        <div className="home-hero-stats">
          <article>
            <strong>{isReady ? 'OK' : '...'}</strong>
            <span>banco local</span>
          </article>
          <article>
            <strong>{hasCameraApi ? 'OK' : 'Indisp.'}</strong>
            <span>câmera</span>
          </article>
          <article>
            <strong>{progressPercent}%</strong>
            <span>treinamento estimado</span>
          </article>
        </div>
        <div className="home-actions">
          <button className="secondary" onClick={onOpenDiagnostics}>Abrir diagnóstico</button>
          <button className="secondary" onClick={onOpenOperations}>Ver painel operacional</button>
        </div>
      </section>

      <section className="home-section-card">
        <h3>Resumo recente</h3>
        <p>Última consulta: {formatLastSessionDate(sessions)}</p>
        <p>{hasServiceWorker ? 'Modo PWA disponível neste navegador.' : 'PWA indisponível neste navegador.'}</p>
      </section>

      <HistoryPanel sessions={sessions} onOpenAll={onOpenHistory} />
    </div>
  )
}

export default HomeDashboard
