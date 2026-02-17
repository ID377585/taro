import { FC } from 'react'
import { RecognitionResult } from '../types'
import { ModelDiagnostics, RecognitionStatus } from '../hooks/useCardRecognition'
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
  modelDiagnostics: ModelDiagnostics
  localDiagnostics: {
    records: number
    cards: number
    candidates: number
    failedSamples: number
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
  modelDiagnostics,
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
      {modelDiagnostics.checked && (
        <p className="recognizer-mapping">
          Modelo: {modelDiagnostics.format || 'formato desconhecido'} | classes:{' '}
          {modelDiagnostics.outputClasses ?? '?'} | labels: {modelDiagnostics.labelsCount}/
          {modelDiagnostics.expectedClasses}
        </p>
      )}
      {modelDiagnostics.placeholder && (
        <p className="recognizer-unmapped">
          Modelo bootstrap detectado. Substitua `public/model/*` pelo modelo final.
        </p>
      )}
      {modelDiagnostics.warnings.map((warning, index) => (
        <p key={`model-warning-${index}`} className="recognizer-unmapped">
          Aviso do modelo: {warning}
        </p>
      ))}
      {status === 'running-local' && (
        <p className="recognizer-mapping">
          Base local: {localDiagnostics.cards} carta(s) utilizáveis,{' '}
          {localDiagnostics.candidates} variação(ões) de orientação.
        </p>
      )}
      {localDiagnostics.records > 0 && localDiagnostics.failedSamples > 0 && (
        <p className="recognizer-unmapped">
          Aviso: {localDiagnostics.failedSamples} captura(s) local(is) não puderam ser
          processadas.
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
