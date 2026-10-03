import { useState } from 'react'
import CatalogueOrderForm from './CatalogueOrderForm'
import OverloadExchangeForm from './OverloadExchangeForm'

export default function PotionOrderForm({ onSubmit }: { onSubmit: (summary: string, payload: Record<string, unknown>) => Promise<void> }) {
  const [mode, setMode] = useState<'potions' | 'overloads'>('potions')
  return (
    <div className="potion-order-shell">
      <div className="order-mode-tabs">
        <button type="button" className={mode === 'potions' ? 'order-mode-tab active' : 'order-mode-tab'} onClick={() => setMode('potions')}>🧪 Potion crafting</button>
        <button type="button" className={mode === 'overloads' ? 'order-mode-tab active special' : 'order-mode-tab special'} onClick={() => setMode('overloads')}>⚗️ Overload exchange</button>
      </div>
      {mode === 'overloads'
        ? <OverloadExchangeForm onSubmit={onSubmit} />
        : <CatalogueOrderForm
            skillKey="herblore"
            title="Potions"
            subtitle="Choose any Koruxa Herblore item. Overloads use the separate clan exchange tab above."
            excludeLabels={['Overload']}
            onSubmit={onSubmit}
          />}
    </div>
  )
}
