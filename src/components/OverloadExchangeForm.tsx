import { useMemo, useState } from 'react'
import { overloadExchange, type OverloadExchangeItem } from '../data/overloadExchange'
import potionsHeader from '../../assets/images/orders/potions-header.png'

type BasketLine = {
  id: string
  item: OverloadExchangeItem
  optionId: string
  quantity: number
}

function scaledGive(item: OverloadExchangeItem, optionId: string, quantity: number) {
  const option = item.options.find((entry) => entry.id === optionId) ?? item.options[0]
  return option.give.map((entry) => ({ ...entry, amount: entry.amount * quantity }))
}

export default function OverloadExchangeForm({ onSubmit }: { onSubmit: (summary: string, payload: Record<string, unknown>) => Promise<void> }) {
  const [selectedId, setSelectedId] = useState(overloadExchange[0].id)
  const [optionId, setOptionId] = useState(overloadExchange[0].options[0].id)
  const [quantity, setQuantity] = useState(1)
  const [notes, setNotes] = useState('')
  const [basket, setBasket] = useState<BasketLine[]>([])
  const [error, setError] = useState('')

  const selected = overloadExchange.find((item) => item.id === selectedId) ?? overloadExchange[0]
  const selectedOption = selected.options.find((entry) => entry.id === optionId) ?? selected.options[0]
  const receive = selected.receiveAmount * Math.max(1, quantity)
  const give = scaledGive(selected, selectedOption.id, Math.max(1, quantity))

  const chooseBundle = (item: OverloadExchangeItem) => {
    setSelectedId(item.id)
    setOptionId(item.options[0].id)
    setQuantity(1)
    setError('')
  }

  const add = () => {
    const qty = Math.max(1, Math.floor(quantity))
    if (selected.maxQuantity && qty > selected.maxQuantity) {
      setError(selected.name + ' is limited to ' + selected.maxQuantity + ' ' + selected.quantityLabel.toLowerCase() + '.')
      return
    }
    setError('')
    setBasket((current) => [...current, {
      id: crypto.randomUUID(),
      item: selected,
      optionId: selectedOption.id,
      quantity: qty,
    }])
  }

  const totals = useMemo(() => {
    const receiveTotal = basket.reduce((sum, line) => sum + line.item.receiveAmount * line.quantity, 0)
    const gives = new Map<string, number>()
    for (const line of basket) {
      for (const entry of scaledGive(line.item, line.optionId, line.quantity)) {
        gives.set(entry.name, (gives.get(entry.name) ?? 0) + entry.amount)
      }
    }
    return { receiveTotal, gives: [...gives.entries()].map(([name, amount]) => ({ name, amount })) }
  }, [basket])

  const submit = async () => {
    if (!basket.length) return
    const lines = basket.map((line) => {
      const option = line.item.options.find((entry) => entry.id === line.optionId) ?? line.item.options[0]
      const receiveAmount = line.item.receiveAmount * line.quantity
      const trade = scaledGive(line.item, option.id, line.quantity)
      return {
        item: 'Overload Potion',
        quantity: receiveAmount,
        emoji: line.item.icon,
        exchange_tier: line.item.id,
        exchange_option: option.name,
        give: trade,
        description: line.item.icon + ' ' + receiveAmount.toLocaleString() + ' × Overload Potion',
      }
    })
    await onSubmit('Overload exchange', {
      form: 'overload-exchange',
      currency: 'materials',
      lines,
      receive_total: totals.receiveTotal,
      give_totals: totals.gives,
      notes: notes.trim(),
    })
    setBasket([])
    setNotes('')
  }

  return (
    <div className="overload-exchange-board">
      <div className="board-heading potion-heading board-heading-art" style={{ backgroundImage: `linear-gradient(90deg, rgba(12,18,35,.92), rgba(47,22,65,.60) 55%, rgba(19,36,19,.78)), url(${potionsHeader})` }}>
        <span>CLAN MATERIAL EXCHANGE</span>
        <h2>Overload Potion Exchange</h2>
        <p>Overloads use the clan's existing material-trade rules — not a gold price.</p>
      </div>

      <div className="overload-tier-grid">
        {overloadExchange.map((item) => (
          <button type="button" className={selected.id === item.id ? 'overload-tier active' : 'overload-tier'} key={item.id} onClick={() => chooseBundle(item)}>
            <span className="overload-tier-icon">{item.icon}</span>
            <span><small>{item.kicker}</small><strong>{item.name}</strong><em>{item.badge}</em></span>
          </button>
        ))}
      </div>

      <div className="selected-order-builder">
        <div className="selected-item-head">
          <div className="selected-item-icon">{selected.icon}</div>
          <div><span className="eyebrow">{selected.kicker.toUpperCase()}</span><h3>{selected.name}</h3><small>{selected.description}</small></div>
        </div>

        <div className="swap-option-grid">
          {selected.options.map((option) => (
            <button
              type="button"
              key={option.id}
              className={selectedOption.id === option.id ? 'swap-option active' : 'swap-option'}
              onClick={() => setOptionId(option.id)}
            >
              <strong>{option.name}</strong>
              <small>{option.give.map((entry) => entry.amount.toLocaleString() + ' ' + entry.name).join(' · ')}</small>
            </button>
          ))}
        </div>

        <div className="selected-item-controls">
          <label>{selected.quantityLabel}
            <input type="number" min={1} max={selected.maxQuantity ?? undefined} value={quantity} onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))} />
          </label>
          <div className="receive-preview"><span>You receive</span><strong>{receive.toLocaleString()} Overloads</strong></div>
          <button type="button" className="exchange-add" onClick={add}>+ Add exchange</button>
        </div>

        <div className="materials-box">
          <div className="materials-title"><span>YOU GIVE</span><small>{selectedOption.name}</small></div>
          {give.map((entry) => <div className="material-chip-line" key={entry.name}><span>🌿 {entry.name}</span><strong>{entry.amount.toLocaleString()}</strong></div>)}
          {selectedOption.highlight ? <div className="bulk-highlight">{selectedOption.highlight}</div> : null}
          {selected.note ? <p className="muted">{selected.note}</p> : null}
        </div>
      </div>

      {error ? <div className="notice danger-note">{error}</div> : null}

      <div className="order-preview-board">
        <div className="order-preview-title"><span>YOUR OVERLOAD EXCHANGE</span><strong>{totals.receiveTotal.toLocaleString()} potions</strong></div>
        {basket.length ? basket.map((line) => {
          const option = line.item.options.find((entry) => entry.id === line.optionId) ?? line.item.options[0]
          return <div className="preview-material" key={line.id}>
            <div className="preview-row">
              <div><strong>{line.item.icon} {(line.item.receiveAmount * line.quantity).toLocaleString()} × Overload Potion</strong><small>{option.name} · {scaledGive(line.item, option.id, line.quantity).map((entry) => entry.amount.toLocaleString() + ' ' + entry.name).join(' · ')}</small></div>
              <button type="button" onClick={() => setBasket((current) => current.filter((entry) => entry.id !== line.id))}>Remove</button>
            </div>
          </div>
        }) : <p className="empty">Choose a bundle and trade option above.</p>}
        {basket.length ? <div className="exchange-give-summary"><span>TOTAL MATERIALS</span>{totals.gives.map((entry) => <strong key={entry.name}>{entry.amount.toLocaleString()} {entry.name}</strong>)}</div> : null}
      </div>

      <label>Swap notes
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} maxLength={500} placeholder="Anything to discuss about the trade?" />
      </label>
      <button type="button" className="exchange-submit" disabled={!basket.length} onClick={submit}>Submit Overload exchange</button>
    </div>
  )
}
