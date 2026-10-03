import { FormEvent, useMemo, useState } from 'react'
import { fishCatalogue, fishPrice } from '../data/orderForms'

type Line = { id: string; fish: string; preparation: 'raw' | 'cooked'; quantity: number; unitPrice: number }

export default function FishOrderForm({ onSubmit }: { onSubmit: (summary: string, payload: Record<string, unknown>) => Promise<void> }) {
  const [fish, setFish] = useState<string>(fishCatalogue[0].name)
  const [preparation, setPreparation] = useState<'raw' | 'cooked'>('cooked')
  const [quantity, setQuantity] = useState(1)
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<Line[]>([])

  const total = useMemo(() => lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0), [lines])

  const add = () => {
    const qty = Math.max(1, Math.floor(quantity))
    const price = fishPrice(fish, preparation)
    setLines((current) => [...current, { id: crypto.randomUUID(), fish, preparation, quantity: qty, unitPrice: price }])
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!lines.length) return
    const payloadLines = lines.map((line) => ({
      item: line.fish,
      preparation: line.preparation,
      quantity: line.quantity,
      unit_price: line.unitPrice,
      line_total: line.quantity * line.unitPrice,
      description: line.quantity.toLocaleString() + ' × ' + (line.preparation === 'raw' ? 'Raw ' : 'Cooked ') + line.fish,
    }))
    await onSubmit('Fish order · ' + lines.length + ' line' + (lines.length === 1 ? '' : 's') + ' · ' + total.toLocaleString() + ' GP', {
      form: 'fish',
      lines: payloadLines,
      total_gp: total,
      notes: notes.trim(),
    })
    setLines([])
    setNotes('')
  }

  return (
    <form className="flash-order-layout" onSubmit={submit}>
      <div className="order-board-main">
        <div className="board-heading fish-heading">
          <span>HAKI FISH MARKET</span>
          <h2>Fresh Catch Order Board</h2>
          <p>Build a mixed raw or cooked fish order with live pricing.</p>
        </div>

        <div className="flash-form-grid">
          <label>Fish
            <select value={fish} onChange={(e) => setFish(e.target.value)}>
              {fishCatalogue.map((entry) => <option key={entry.name}>{entry.name}</option>)}
            </select>
          </label>
          <label>Preparation
            <select value={preparation} onChange={(e) => setPreparation(e.target.value as 'raw' | 'cooked')}>
              <option value="raw">Raw</option>
              <option value="cooked">Cooked</option>
            </select>
          </label>
          <label>Quantity
            <input type="number" min={1} value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} />
          </label>
          <div className="price-preview flashy">
            <span>Unit price</span>
            <strong>{fishPrice(fish, preparation).toLocaleString()} GP</strong>
          </div>
        </div>

        <button className="exchange-add" type="button" onClick={add}>+ Add to fish order</button>

        <div className="order-preview-board">
          <div className="order-preview-title"><span>LIVE ORDER PREVIEW</span><strong>{lines.length} line{lines.length === 1 ? '' : 's'}</strong></div>
          {lines.length ? lines.map((line) => (
            <div className="preview-row" key={line.id}>
              <div>
                <strong>{line.quantity.toLocaleString()} × {line.preparation === 'raw' ? 'Raw ' : 'Cooked '}{line.fish}</strong>
                <small>{line.unitPrice.toLocaleString()} GP each</small>
              </div>
              <div className="preview-row-actions">
                <strong>{(line.quantity * line.unitPrice).toLocaleString()} GP</strong>
                <button type="button" onClick={() => setLines((current) => current.filter((entry) => entry.id !== line.id))}>Remove</button>
              </div>
            </div>
          )) : <p className="empty">Add fish above to build your order.</p>}
          {lines.length ? <div className="flash-total"><span>ORDER TOTAL</span><strong>{total.toLocaleString()} GP</strong></div> : null}
        </div>

        <label>Order notes
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} maxLength={500} placeholder="Optional notes for the crafter…" />
        </label>
        <button className="exchange-submit" disabled={!lines.length}>Submit fish order</button>
      </div>

      <aside className="order-board-sidebar">
        <div className="flash-card blue">
          <span className="flash-icon">🐟</span>
          <div><strong>Raw pricing</strong><p>Raw fish cost half the cooked price, rounded up to the nearest 50 GP.</p></div>
        </div>
        <div className="flash-card gold">
          <span className="flash-icon">✦</span>
          <div><strong>Mixed baskets</strong><p>Add multiple fish types and mix raw/cooked lines in one complete order.</p></div>
        </div>
        <div className="price-reference">
          <div className="price-reference-title">PRICE QUICK LOOK</div>
          {fishCatalogue.slice(0, 8).map((entry) => (
            <div className="price-reference-row" key={entry.name}>
              <span>{entry.name}</span><strong>{entry.cookedPrice.toLocaleString()}</strong>
            </div>
          ))}
          <small>Cooked prices shown · full list available in the selector</small>
        </div>
      </aside>
    </form>
  )
}
