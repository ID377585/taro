import { FC } from 'react'
import './CardRecognizer.css'

interface CardRecognizerProps {
  enabled: boolean
  onToggle: () => void
}

const CardRecognizer: FC<CardRecognizerProps> = ({
  enabled,
  onToggle,
}) => {
  return (
    <div className="recognizer-panel recognizer-panel--compact">
      <div className="recognizer-header">
        <h3>Reconhecimento</h3>
        <button className="recognizer-toggle" onClick={onToggle}>
          {enabled ? 'Pausar' : 'Ativar'}
        </button>
      </div>
    </div>
  )
}

export default CardRecognizer
