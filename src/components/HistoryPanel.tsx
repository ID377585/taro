import { FC } from 'react'
import { SpreadingSession } from '../types'
import './HistoryPanel.css'

interface HistoryPanelProps {
  sessions: SpreadingSession[]
}

const formatDate = (timestamp: number) =>
  new Date(timestamp).toLocaleString('pt-BR')

const HistoryPanel: FC<HistoryPanelProps> = ({ sessions }) => {
  return (
    <div className="history-panel">
      <h3>Histórico Local</h3>
      {sessions.length === 0 && <p>Nenhuma sessão salva ainda.</p>}

      <ul>
        {sessions.slice(0, 6).map(session => (
          <li key={session.id}>
            <strong>{session.spreadName}</strong>
            <small>{formatDate(session.timestamp)}</small>
            <span>{session.drawnCards.length} carta(s) registradas</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default HistoryPanel
