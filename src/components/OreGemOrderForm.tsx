import { FormEvent, useMemo, useState } from 'react'
import { ORE_GEM_ITEM_CAP, oreGemMaterials, requiredOreForGems } from '../data/orderForms'

type Basket = Record<string, { extraOre: number; gems: number }>

export default function OreGemOrderForm({ onSubmit }: { onSubmit: (summary: string, payload: Record<string, unknown>) => Promise<void> }) {
  const [materialName, setMaterialName] = useState(oreGemMaterials[0].name)
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

  const add = () => {
    setError('')
    const qty = Math.max(1, Math.floor(quantity))
    const current = basket[material.name] ?? { extraOre: 0, gems: 0 }
    if (type === 'gem' && (!material.gemName || material.gemPrice == null)) return setError('This material has no matching gem.')
    const nextExtra = type === 'ore' ? current.extraOre + qty : current.extraOre
    const nextGems = type === 'gem' ? current.gems + qty : current.gems
    const required = requiredOreForGems(nextGems)
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
        description: row.totalOre.toLocaleString() + ' × ' + row.material.name + ' Ore (' + row.requiredOre.toLocaleString() + ' required + ' + row.extraOre.toLocaleString() + ' extra)',
      })
      if (row.gems) output.push({
        item: row.material.gemName,
        type: 'gem',
        quantity: row.gems,
        matching_ore: row.material.name,
        unit_price: row.material.gemPrice,
        line_total: row.gemTotal,
        description: row.gems.toLocaleString() + ' × ' + row.material.gemName + ' (Uncut Gem)',
      })
      return output
    })
    await onSubmit('Ore & Gem order · ' + lines.length + ' line' + (lines.length === 1 ? '' : 's') + ' · ' + grandTotal.toLocaleString() + ' GP', {
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
    <form className="stack" onSubmit={submit}>
      <div className="rule-banner-inline"><strong>Gem rule:</strong> First 4,000 gems need 50 matching ore each. Gems over 4,000 need 100 each. Required ore is added automatically; extra ore stays separate.</div>
      <div className="form-grid">
        <label>Material<select value={materialName} onChange={(e) => { setMaterialName(e.target.value); setType('ore') }}>{oreGemMaterials.map((entry) => <option key={entry.name}>{entry.name}</option>)}</select></label>
        <label>Type<select value={type} onChange={(e) => setType(e.target.value as 'ore' | 'gem')}><option value="ore">Ore</option>{material.gemName ? <option value="gem">Uncut Gem · {material.gemName}</option> : null}</select></label>
        <label>Quantity<input type="number" min={1} max={ORE_GEM_ITEM_CAP} value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} /></label>
        <div className="price-preview"><span>Unit price</span><strong>{Number(type === 'ore' ? material.orePrice : material.gemPrice ?? 0).toLocaleString()} GP</strong></div>
      </div>
      <button className="secondary-button" type="button" onClick={add}>Add to ore/gem order</button>
      {error ? <div className="notice danger-note">{error}</div> : null}
      {rows.map((row) => <div className="order-material-block" key={row.material.name}>
        <div className="list-row"><div><strong>{row.material.name}</strong><span>{row.gems ? row.gems.toLocaleString() + ' ' + row.material.gemName + ' · ' : ''}{row.totalOre.toLocaleString()} ore total</span></div><button className="ghost-button" type="button" onClick={() => clearMaterial(row.material.name)}>Remove</button></div>
        {row.gems ? <div className="tier-detail">Matching ore: {Math.min(row.gems, 4000).toLocaleString()} gems @ 50 + {Math.max(0, row.gems - 4000).toLocaleString()} gems @ 100 = <strong>{row.requiredOre.toLocaleString()} required ore</strong>{row.extraOre ? ' + ' + row.extraOre.toLocaleString() + ' extra ore' : ''}</div> : null}
      </div>)}
      {rows.length ? <div className="total-banner"><span>Order total</span><strong>{grandTotal.toLocaleString()} GP</strong></div> : null}
      <label>Notes<textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} maxLength={500} placeholder="Optional order notes" /></label>
      <button className="primary-button" disabled={!rows.length}>Submit ore/gem order</button>
    </form>
  )
}
