import { FormEvent, useMemo, useState } from 'react'
import { ORE_GEM_ITEM_CAP, oreGemMaterials, requiredOreForGems } from '../data/orderForms'
import { materialEmoji } from '../data/orderVisuals'

type Basket = Record<string, { extraOre: number; gems: number }>

export default function OreGemOrderForm({ onSubmit }: { onSubmit: (summary: string, payload: Record<string, unknown>) => Promise<void> }) {
  const [materialName, setMaterialName] = useState<string>(oreGemMaterials[0].name)
  const [type, setType] = useState<'ore' | 'gem'>('ore')
  const [quantity, setQuantity] = useState(1)
  const [notes, setNotes] = useState('')
  const [basket, setBasket] = useState<Basket>({})
  const [error, setError] = useState('')

  const material = oreGemMaterials.find((entry) => entry.name === materialName) ?? oreGemMaterials[0]
  const rows = useMemo(() => oreGemMaterials.flatMap((entry) => {
    const state = basket[entry.name]
    if (!state) return []
    const requiredOre = requiredOreForGems(state.gems)
    const totalOre = state.extraOre + requiredOre
    const oreTotal = totalOre * entry.orePrice
    const gemTotal = state.gems * Number(entry.gemPrice ?? 0)
    return [{ material: entry, extraOre: state.extraOre, requiredOre, totalOre, gems: state.gems, oreTotal, gemTotal, total: oreTotal + gemTotal }]
  }).filter((row) => row.totalOre > 0 || row.gems > 0), [basket])

  const grandTotal = useMemo(() => rows.reduce((sum, row) => sum + row.total, 0), [rows])

  const chooseMaterial = (name: string) => {
    setMaterialName(name)
    const chosen = oreGemMaterials.find((entry) => entry.name === name)
    if (!chosen?.gemName && type === 'gem') setType('ore')
  }

  const add = () => {
    setError('')
    const qty = Math.max(1, Math.floor(quantity))
    const current = basket[material.name] ?? { extraOre: 0, gems: 0 }
    if (type === 'gem' && (!material.gemName || material.gemPrice == null)) return setError('This material has no matching gem.')
    const nextExtra = type === 'ore' ? current.extraOre + qty : current.extraOre
    const nextGems = type === 'gem' ? current.gems + qty : current.gems
    if (nextGems > ORE_GEM_ITEM_CAP) return setError('No individual gem quantity can exceed ' + ORE_GEM_ITEM_CAP.toLocaleString() + '.')
    if (nextExtra > ORE_GEM_ITEM_CAP) return setError('Extra ore cannot exceed ' + ORE_GEM_ITEM_CAP.toLocaleString() + ' for one material.')
    setBasket((old) => ({ ...old, [material.name]: { extraOre: nextExtra, gems: nextGems } }))
  }

  const clearMaterial = (name: string) => setBasket((old) => {
    const next = { ...old }
    delete next[name]
    return next
  })

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!rows.length) return
    const lines = rows.flatMap((row) => {
      const output: any[] = []
      if (row.totalOre) output.push({
        item: row.material.name + ' Ore',
        type: 'ore',
        quantity: row.totalOre,
        required_for_gems: row.requiredOre,
        extra_ore: row.extraOre,
        unit_price: row.material.orePrice,
        line_total: row.oreTotal,
        emoji: '⛏️',
        description: '⛏️ ' + row.totalOre.toLocaleString() + ' × ' + row.material.name + ' Ore' + (row.requiredOre ? ' (' + row.requiredOre.toLocaleString() + ' required + ' + row.extraOre.toLocaleString() + ' extra)' : ''),
      })
      if (row.gems) output.push({
        item: row.material.gemName,
        type: 'gem',
        quantity: row.gems,
        matching_ore: row.material.name,
        unit_price: row.material.gemPrice,
        line_total: row.gemTotal,
        emoji: '💎',
        description: '💎 ' + row.gems.toLocaleString() + ' × ' + row.material.gemName + ' (Uncut Gem)',
      })
      return output
    })
    await onSubmit('Ore & Gem order · ' + grandTotal.toLocaleString() + ' GP', {
      form: 'ore-gems',
      lines,
      total_gp: grandTotal,
      notes: notes.trim(),
      rule: 'First 4,000 gems: 50 matching ore each; gems over 4,000: 100 each.',
    })
    setBasket({})
    setNotes('')
  }

  return (
    <form className="flash-order-layout" onSubmit={submit}>
      <div className="order-board-main">
        <div className="board-heading ore-heading">
          <span>KORUXA • HAKI MARKET</span>
          <h2>Ore & Gem Price Board</h2>
          <p>Click a material tier, choose ore or gem, and matching ore is calculated automatically.</p>
        </div>

        <section className="item-button-group">
          <div className="item-button-group-title"><span>CHOOSE A MATERIAL</span><small>{oreGemMaterials.length} tiers</small></div>
          <div className="item-button-grid ore-button-grid">
            {oreGemMaterials.map((entry) => (
              <button
                type="button"
                key={entry.name}
                className={materialName === entry.name ? 'item-choice active' : 'item-choice'}
                onClick={() => chooseMaterial(entry.name)}
              >
                <span className="item-choice-emoji">{materialEmoji[entry.name] ?? '⛏️'}</span>
                <span>
                  <strong>{entry.name}</strong>
                  <small>{entry.orePrice.toLocaleString()} GP ore{entry.gemName ? ' · ' + entry.gemName : ''}</small>
                </span>
              </button>
            ))}
          </div>
        </section>

        <div className="selected-order-builder compact-builder">
          <div className="selected-item-head">
            <div className="selected-item-icon">{materialEmoji[material.name] ?? '⛏️'}</div>
            <div><span className="eyebrow">SELECTED TIER</span><h3>{material.name}</h3><small>{material.gemName ? material.gemName + ' available' : 'Ore only'}</small></div>
          </div>

          <div className="choice-toggle-row">
            <button type="button" className={type === 'ore' ? 'choice-toggle active' : 'choice-toggle'} onClick={() => setType('ore')}>⛏️ Ore · {material.orePrice.toLocaleString()} GP</button>
            {material.gemName ? <button type="button" className={type === 'gem' ? 'choice-toggle active' : 'choice-toggle'} onClick={() => setType('gem')}>💎 {material.gemName} · {Number(material.gemPrice).toLocaleString()} GP</button> : null}
          </div>

          <div className="selected-item-controls">
            <label>Quantity<input type="number" min={1} max={ORE_GEM_ITEM_CAP} value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} /></label>
            <div className="receive-preview"><span>Unit price</span><strong>{Number(type === 'ore' ? material.orePrice : material.gemPrice ?? 0).toLocaleString()} GP</strong></div>
            <button className="exchange-add" type="button" onClick={add}>+ Add {type === 'ore' ? 'ore' : 'gems'}</button>
          </div>
        </div>

        {error ? <div className="notice danger-note">{error}</div> : null}

        <div className="order-preview-board">
          <div className="order-preview-title"><span>LIVE ORDER PREVIEW</span><strong>{rows.length} material{rows.length === 1 ? '' : 's'}</strong></div>
          {rows.length ? rows.map((row) => (
            <div className="preview-material" key={row.material.name}>
              <div className="preview-row">
                <div>
                  <strong>{materialEmoji[row.material.name] ?? '⛏️'} {row.material.name}</strong>
                  <small>{row.gems ? '💎 ' + row.gems.toLocaleString() + ' ' + row.material.gemName + ' · ' : ''}⛏️ {row.totalOre.toLocaleString()} ore total</small>
                </div>
                <button type="button" onClick={() => clearMaterial(row.material.name)}>Remove</button>
              </div>
              {row.gems ? <div className="ratio-breakdown">
                <span>{Math.min(row.gems, 4000).toLocaleString()} gems × 50 ore</span>
                <span>{Math.max(0, row.gems - 4000).toLocaleString()} gems × 100 ore</span>
                <strong>{row.requiredOre.toLocaleString()} required ore{row.extraOre ? ' + ' + row.extraOre.toLocaleString() + ' extra' : ''}</strong>
              </div> : null}
              <div className="preview-cost-row">
                <span>Ore {row.oreTotal.toLocaleString()} GP</span>
                {row.gems ? <span>Gems {row.gemTotal.toLocaleString()} GP</span> : null}
                <strong>{row.total.toLocaleString()} GP</strong>
              </div>
            </div>
          )) : <p className="empty">Click a material above to start the order.</p>}
          {rows.length ? <div className="flash-total"><span>ORDER TOTAL</span><strong>{grandTotal.toLocaleString()} GP</strong></div> : null}
        </div>

        <label>Order notes
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} maxLength={500} placeholder="Optional notes for the fulfiller…" />
        </label>
        <button className="exchange-submit" disabled={!rows.length}>Submit ore & gem order</button>
      </div>

      <aside className="order-board-sidebar">
        <div className="ratio-card blue-ratio"><span className="ratio-label">1 – 4,000 GEMS</span><strong>50 : 1</strong><small>ORE : GEM</small></div>
        <div className="ratio-card purple-ratio"><span className="ratio-label">OVER 4,000 GEMS</span><strong>100 : 1</strong><small>ORE : GEM</small></div>
        <div className="flash-card gold"><span className="flash-icon">!</span><div><strong>Important rule</strong><p>Required ore must match the gem tier. The app adds it automatically and keeps your extra ore separate.</p></div></div>
        <div className="flash-card blue"><span className="flash-icon">✓</span><div><strong>One complete order</strong><p>Build the whole ore and gem request here. Multiple orders cannot be used to bypass the ratio.</p></div></div>
      </aside>
    </form>
  )
}
