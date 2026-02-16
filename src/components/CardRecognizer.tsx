import { FC } from 'react'
import { RecognitionResult } from '../types'
import { RecognitionStatus } from '../hooks/useCardRecognition'
import './CardRecognizer.css'

interface CardRecognizerProps {
  status: RecognitionStatus
  error: string | null
  enabled: boolean
  onToggle: () => void
  lastResult: RecognitionResult | null
  labelDiagnostics: {
    totalLabels: number
    mappedLabels: number
    unmappedLabels: string[]
  }
  localDiagnostics: {
    cards: number
    candidates: number
  }
}

const statusLabels: Record<RecognitionStatus, string> = {
  idle: 'Parado',
  loading: 'Carregando modelo',
  running: 'Reconhecendo cartas',
  'running-local': 'Reconhecimento local (capturas salvas)',
  'no-model': 'Modelo não encontrado',
  error: 'Erro no reconhecimento',
}

const CardRecognizer: FC<CardRecognizerProps> = ({
  status,
  error,
  enabled,
  onToggle,
  lastResult,
  labelDiagnostics,
  localDiagnostics,
}) => {
  return (
    <div className="recognizer-panel">
      <div className="recognizer-header">
        <h3>Reconhecimento</h3>
        <button className="recognizer-toggle" onClick={onToggle}>
          {enabled ? 'Pausar' : 'Ativar'}
        </button>
      </div>

      <p className="recognizer-status">{statusLabels[status]}</p>
      {error && <p className="recognizer-error">{error}</p>}
      {labelDiagnostics.totalLabels > 0 && (
        <p className="recognizer-mapping">
          Labels mapeadas: {labelDiagnostics.mappedLabels}/
          {labelDiagnostics.totalLabels}
        </p>
      )}
      {status === 'running-local' && (
        <p className="recognizer-mapping">
          Base local: {localDiagnostics.cards} carta(s), {localDiagnostics.candidates}{' '}
          variação(ões) de orientação.
        </p>
      )}
      {labelDiagnostics.unmappedLabels.length > 0 && (
        <p className="recognizer-unmapped">
          Sem correspondência: {labelDiagnostics.unmappedLabels.join(', ')}
        </p>
      )}

      {lastResult?.card && (
        <div className="recognizer-last">
          <strong>Última carta:</strong> {lastResult.card.nome}{' '}
          {lastResult.isReversed ? '(Invertida)' : '(Vertical)'} -{' '}
          {Math.round(lastResult.confidence * 100)}%
        </div>
      )}
    </div>
  )
}

export default CardRecognizer
