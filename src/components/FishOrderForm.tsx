import { FormEvent, useEffect, useMemo, useState } from 'react'
import { fishCatalogue, fishPrice } from '../data/orderForms'
import { fishEmoji } from '../data/orderVisuals'
import fishHeader from '../../assets/images/orders/fish-header.png'
import { getSkillActions } from '../lib/data'
import { apiPost } from '../lib/api'
import SupplierOfferPanel, { type SupplierOfferOption } from './SupplierOfferPanel'

type Line = { id: string; fish: string; preparation: 'raw' | 'cooked'; quantity: number; unitPrice: number }

function fishOfferKey(name: string, preparation: 'raw' | 'cooked') {
  return 'fish:' + preparation + ':' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
}

export default function FishOrderForm({ onSubmit }: { onSubmit: (summary: string, payload: Record<string, unknown>) => Promise<void> }) {
  const [fish, setFish] = useState<string>(fishCatalogue[0].name)
  const [preparation, setPreparation] = useState<'raw' | 'cooked'>('cooked')
  const [quantity, setQuantity] = useState(1)
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<Line[]>([])
  const [supplierOptions, setSupplierOptions] = useState<SupplierOfferOption[]>([])
  const [supplierSelectedKeys, setSupplierSelectedKeys] = useState<Set<string> | null>(null)

  useEffect(() => {
    let cancelled = false
    const loadLevels = async () => {
      try {
        let actions = await getSkillActions()
        const hasFishing = actions.some((action) => action.skill_key === 'fishing')
        const hasCooking = actions.some((action) => action.skill_key === 'cooking')
        if (!hasFishing) await apiPost('/api/catalog/wiki-sync', { skill_key: 'fishing' })
        if (!hasCooking) await apiPost('/api/catalog/wiki-sync', { skill_key: 'cooking' })
        if (!hasFishing || !hasCooking) actions = await getSkillActions()

        if (cancelled) return
        const options: SupplierOfferOption[] = []
        for (const entry of fishCatalogue) {
          for (const prep of ['raw','cooked'] as const) {
            const wanted = (prep === 'raw' ? entry.name : 'Cooked ' + entry.name).toLowerCase()
            const skillKey = prep === 'raw' ? 'fishing' : 'cooking'
            const match = actions.find((action) =>
              action.skill_key === skillKey &&
              (
                action.reward_label.toLowerCase() === wanted ||
                action.reward_label.toLowerCase().replace(/^raw\s+/,'') === entry.name.toLowerCase() ||
                (prep === 'cooked' && action.reward_label.toLowerCase().includes(entry.name.toLowerCase()))
              )
            )
            options.push({
              key: fishOfferKey(entry.name, prep),
              label: (prep === 'raw' ? 'Raw ' : 'Cooked ') + entry.name,
              group: prep === 'raw' ? 'Raw Fish' : 'Cooked Fish',
              skillKey,
              minLevel: match ? Number(match.min_level || 1) : null,
            })
          }
        }
        setSupplierOptions(options)
      } catch {
        setSupplierOptions(fishCatalogue.flatMap((entry) => ([
          { key: fishOfferKey(entry.name,'raw'), label: 'Raw ' + entry.name, group: 'Raw Fish', skillKey: 'fishing', minLevel: null },
          { key: fishOfferKey(entry.name,'cooked'), label: 'Cooked ' + entry.name, group: 'Cooked Fish', skillKey: 'cooking', minLevel: null },
        ])))
      }
    }
    loadLevels()
    return () => { cancelled = true }
  }, [])

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
      emoji: fishEmoji[line.fish] ?? '🐟',
      offer_key: fishOfferKey(line.fish, line.preparation),
      description: (fishEmoji[line.fish] ?? '🐟') + ' ' + line.quantity.toLocaleString() + ' × ' + (line.preparation === 'raw' ? 'Raw ' : 'Cooked ') + line.fish,
    }))
    await onSubmit('Fish order · ' + total.toLocaleString() + ' GP', {
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
        <div className="board-heading fish-heading board-heading-art" style={{ backgroundImage: `linear-gradient(90deg, rgba(7,18,31,.90), rgba(13,22,38,.62) 52%, rgba(10,14,24,.82)), url(${fishHeader})` }}>
          <span>HAKI FISH MARKET</span>
          <h2>Fresh Catch Order Board</h2>
          <p>Click the fish you want, choose raw or cooked, then build one complete order.</p>
        </div>

        <section className="item-button-group">
          <div className="item-button-group-title"><span>CHOOSE A FISH</span><small>{fishCatalogue.length} available</small></div>
          <div className="item-button-grid fish-button-grid">
            {fishCatalogue.map((entry) => (
              <button
                type="button"
                key={entry.name}
                className={
                  'item-choice' +
                  (fish === entry.name ? ' active' : '') +
                  (supplierSelectedKeys && !supplierSelectedKeys.has(fishOfferKey(entry.name, preparation)) ? ' no-supplier' : '')
                }
                onClick={() => setFish(entry.name)}
              >
                <span className="item-choice-emoji">{fishEmoji[entry.name] ?? '🐟'}</span>
                <span><strong>{entry.name}</strong><small>{fishPrice(entry.name, preparation).toLocaleString()} GP {preparation}</small></span>
              </button>
            ))}
          </div>
        </section>

        <div className="selected-order-builder compact-builder">
          <div className="selected-item-head">
            <div className="selected-item-icon">{fishEmoji[fish] ?? '🐟'}</div>
            <div><span className="eyebrow">SELECTED FISH</span><h3>{fish}</h3><small>{fishPrice(fish, preparation).toLocaleString()} GP each</small></div>
          </div>

          <div className="choice-toggle-row">
            <button type="button" className={preparation === 'raw' ? 'choice-toggle active' : 'choice-toggle'} onClick={() => setPreparation('raw')}>🧊 Raw</button>
            <button type="button" className={preparation === 'cooked' ? 'choice-toggle active' : 'choice-toggle'} onClick={() => setPreparation('cooked')}>🍳 Cooked</button>
          </div>

          <div className="selected-item-controls">
            <label>Quantity<input type="number" min={1} value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} /></label>
            <div className="receive-preview"><span>Line total</span><strong>{(Math.max(1, quantity) * fishPrice(fish, preparation)).toLocaleString()} GP</strong></div>
            <button className="exchange-add" type="button" onClick={add}>+ Add fish</button>
          </div>
        </div>

        <SupplierOfferPanel
          categoryId="fish"
          options={supplierOptions}
          selectedKey={fishOfferKey(fish, preparation)}
          basketKeys={lines.map((line) => fishOfferKey(line.fish, line.preparation))}
          onCoverageChange={setSupplierSelectedKeys}
        />

        <div className="order-preview-board">
          <div className="order-preview-title"><span>LIVE ORDER PREVIEW</span><strong>{lines.length} item{lines.length === 1 ? '' : 's'}</strong></div>
          {lines.length ? lines.map((line) => (
            <div className="preview-row" key={line.id}>
              <div>
                <strong>{fishEmoji[line.fish] ?? '🐟'} {line.quantity.toLocaleString()} × {line.preparation === 'raw' ? 'Raw ' : 'Cooked '}{line.fish}</strong>
                <small>{line.unitPrice.toLocaleString()} GP each</small>
              </div>
              <div className="preview-row-actions">
                <strong>{(line.quantity * line.unitPrice).toLocaleString()} GP</strong>
                <button type="button" onClick={() => setLines((current) => current.filter((entry) => entry.id !== line.id))}>Remove</button>
              </div>
            </div>
          )) : <p className="empty">No fish added yet. Choose one above to start your order.</p>}
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
          <div><strong>One complete order</strong><p>Mix as many fish types as you need in one request instead of creating lots of separate orders.</p></div>
        </div>
        <div className="flash-card gold">
          <span className="flash-icon">🧊</span>
          <div><strong>Raw pricing</strong><p>Raw fish cost half the cooked price, rounded up to the nearest 50 GP.</p></div>
        </div>
        <div className="flash-card blue">
          <span className="flash-icon">✓</span>
          <div><strong>Tracked in the toolkit</strong><p>Your full basket stays visible in My Requests and the Discord order card.</p></div>
        </div>
      </aside>
    </form>
  )
}
