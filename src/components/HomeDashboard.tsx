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
  if (!last) return 'Nenhuma consulta registrada'
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
        <div className="home-oracle-mark" aria-hidden="true">
          ✦
        </div>

        <span className="home-kicker">Tarólogo Patrick Fernandez</span>

        <h1>Sistema profissional de leituras espirituais</h1>

        <p>
          Organize consultas, acompanhe consulentes, registre tiragens, gere relatórios
          profissionais e conduza atendimentos com uma experiência clara, elegante e acolhedora.
        </p>

        <div className="home-primary-actions">
          <button onClick={onStartReading}>Iniciar nova consulta</button>
          <button className="secondary" onClick={onOpenHistory}>
            Ver histórico
          </button>
        </div>

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
              <p>
                Existe uma atividade anterior neste navegador. Você pode continuar manualmente
                quando desejar.
              </p>
            </div>

            <div className="home-actions home-actions--compact">
              <button onClick={savedFlow.onContinue}>Continuar atividade</button>
              <button className="secondary" onClick={savedFlow.onClear}>
                Descartar
              </button>
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
            <span>Consulte leituras salvas, exporte relatórios e acompanhe recorrências.</span>
          </span>
        </button>

        <button className="home-action-card" onClick={onRegisterCards}>
          <em>🌙</em>
          <span>
            <strong>Registro de cartas</strong>
            <span>Cadastre imagens e fortaleça a base visual para reconhecimento.</span>
          </span>
        </button>

        <button className="home-action-card" onClick={onOpenOperations}>
          <em>⚜️</em>
          <span>
            <strong>Painel operacional</strong>
            <span>Veja progresso, fila local, sincronização e saúde do sistema.</span>
          </span>
        </button>
      </section>

      <section className="home-section-card home-section-card--status">
        <div>
          <span className="section-eyebrow">Pronto para atendimento</span>
          <h2>Status do sistema</h2>
          <p>
            Verifique rapidamente se o app está preparado para uso no aparelho atual antes de
            iniciar uma consulta.
          </p>
        </div>

        <div className="home-status-grid">
          <article className={isReady ? 'status-ok' : 'status-warning'}>
            <strong>{isReady ? 'Ativo' : 'Carregando'}</strong>
            <span>Banco local</span>
          </article>

          <article className={hasCameraApi ? 'status-ok' : 'status-warning'}>
            <strong>{hasCameraApi ? 'Disponível' : 'Indisponível'}</strong>
            <span>Câmera</span>
          </article>

          <article>
            <strong>{progressPercent}%</strong>
            <span>Treinamento estimado</span>
          </article>
        </div>

        <div className="home-actions">
          <button className="secondary" onClick={onOpenDiagnostics}>
            Abrir diagnóstico
          </button>
          <button className="secondary" onClick={onOpenOperations}>
            Ver operações
          </button>
        </div>
      </section>

      <section className="home-section-card home-recent-card">
        <div>
          <span className="section-eyebrow">Resumo recente</span>
          <h3>Últimos movimentos</h3>
        </div>

        <div className="recent-list">
          <article>
            <strong>Última consulta</strong>
            <span>{formatLastSessionDate(sessions)}</span>
          </article>

          <article>
            <strong>Modo aplicativo</strong>
            <span>
              {hasServiceWorker
                ? 'PWA disponível neste navegador'
                : 'PWA indisponível neste navegador'}
            </span>
          </article>

          <article>
            <strong>Relatórios</strong>
            <span>Histórico preparado para exportação profissional</span>
          </article>
        </div>
      </section>

      <HistoryPanel sessions={sessions} onOpenAll={onOpenHistory} />
    </div>
  )
}

export default HomeDashboard