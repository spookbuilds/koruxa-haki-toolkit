import { FormEvent, useMemo, useState } from 'react'
import { fishCatalogue, fishPrice } from '../data/orderForms'

type Line = { id: string; fish: string; preparation: 'raw' | 'cooked'; quantity: number; unitPrice: number }

export default function FishOrderForm({ onSubmit }: { onSubmit: (summary: string, payload: Record<string, unknown>) => Promise<void> }) {
  const [fish, setFish] = useState(fishCatalogue[0].name)
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
    <form className="stack" onSubmit={submit}>
      <div className="form-grid">
        <label>Fish<select value={fish} onChange={(e) => setFish(e.target.value)}>{fishCatalogue.map((entry) => <option key={entry.name}>{entry.name}</option>)}</select></label>
        <label>Preparation<select value={preparation} onChange={(e) => setPreparation(e.target.value as 'raw' | 'cooked')}><option value="raw">Raw</option><option value="cooked">Cooked</option></select></label>
        <label>Quantity<input type="number" min={1} value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} /></label>
        <div className="price-preview"><span>Unit price</span><strong>{fishPrice(fish, preparation).toLocaleString()} GP</strong></div>
      </div>
      <button className="secondary-button" type="button" onClick={add}>Add to fish order</button>
      {lines.map((line) => <div className="list-row" key={line.id}><div><strong>{line.quantity.toLocaleString()} × {line.preparation === 'raw' ? 'Raw ' : 'Cooked '}{line.fish}</strong><span>{line.unitPrice.toLocaleString()} GP each</span></div><div className="row-actions"><strong>{(line.quantity * line.unitPrice).toLocaleString()} GP</strong><button className="ghost-button" type="button" onClick={() => setLines((current) => current.filter((entry) => entry.id !== line.id))}>Remove</button></div></div>)}
      {lines.length ? <div className="total-banner"><span>Order total</span><strong>{total.toLocaleString()} GP</strong></div> : null}
      <label>Notes<textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} maxLength={500} placeholder="Optional order notes" /></label>
      <button className="primary-button" disabled={!lines.length}>Submit fish order</button>
    </form>
  )
}
