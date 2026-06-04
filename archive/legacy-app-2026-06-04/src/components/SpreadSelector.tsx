import { FC } from 'react'
import { Spread } from '../types'
import './SpreadSelector.css'

interface SpreadSelectorProps {
  spreads: Spread[]
  onSelect: (spread: Spread) => void
}

const SpreadSelector: FC<SpreadSelectorProps> = ({ spreads, onSelect }) => {
  return (
    <div className="spread-selector">
      <h2>Escolha uma Tiragem</h2>
      <div className="spread-selector-grid">
        {spreads.map(spread => (
          <button
            key={spread.id}
            className="spread-button"
            onClick={() => onSelect(spread)}
          >
            <h3>{spread.nome}</h3>
            <small>{spread.descricao}</small>
          </button>
        ))}
      </div>
    </div>
  )
}

export default SpreadSelector
