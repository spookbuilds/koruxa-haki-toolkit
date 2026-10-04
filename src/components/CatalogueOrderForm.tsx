import { useEffect, useMemo, useState } from 'react'
import { getSkillActions } from '../lib/data'
import { apiPost } from '../lib/api'
import { itemEmoji, orderGroup } from '../data/orderVisuals'
import type { SkillAction } from '../types'

type BasketLine = {
  id: string
  action: SkillAction
  quantity: number
  materials: Array<{ item: string; quantity: number }>
}

function materialLines(action: SkillAction, quantity: number) {
  const cycles = Math.ceil(quantity / Math.max(1, Number(action.amount || 1)))
  return (action.ingredients ?? []).map((ingredient) => ({
    item: ingredient.item_key,
    quantity: Math.ceil(Number(ingredient.quantity || 0) * cycles),
  }))
}

function prettyItemKey(value: string) {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function displayActionLabel(action: SkillAction, skillKey: string) {
  const label = action.reward_label
  if (skillKey !== 'jewelery') return label
  const lower = label.toLowerCase()
  if (lower.startsWith('cut ') || lower.includes(' ring') || lower.includes(' amulet') || lower.includes(' mould')) return label
  if (/(opal|amber|aquastone|garnet|frostgem|voidopal|sunstone|duskgem|stormheart|astralite|emberstone|magmaheart|pyreshard)/i.test(label)) {
    return 'Cut ' + label.replace(/^uncut\s+/i, '')
  }
  return label
}

function preferredGroups(skillKey: string, groups: string[]) {
  const order: Record<string, string[]> = {
    smithing: ['Bars','Dustite','Copite','Velorite','Crimsrite','Shalore','Noctite','Auorite','Vexite','Zephyne','Korunite','Drakonite','Pyrethium','Infernite','Other Smithing'],
    fletching: ['Arrows','Bows','Crossbows','Other Fletching'],
    jewelery: ['Cut Gems','Rings','Amulets','Other Jewellery'],
    crafting: [
      'Tools · Tinderboxes',
      'Tools · Pestles',
      'Tools · Lockpicks',
      'Staves',
      'Ranged · Hoods',
      'Ranged · Tunics',
      'Ranged · Chaps',
      'Ranged · Bracers',
      'Ranged · Boots',
      'Magic · Hats',
      'Magic · Robes',
      'Magic · Skirts',
      'Magic · Wraps',
      'Magic · Shoes',
      'Hide & Leather',
      'Other Crafting',
    ],
    herblore: ['Potions','Super Potions','Special Potions','Overloads'],
    farming: ['Seeds','Saplings','Crops & Produce','Herbs','Flowers','Fruit'],
  }
  const ranking = order[skillKey] ?? []
  return [...groups].sort((a, b) => {
    const ai = ranking.indexOf(a)
    const bi = ranking.indexOf(b)
    if (ai === -1 && bi === -1) return a.localeCompare(b)
    if (ai === -1) return 1
    if (bi === -1) return -1
    return ai - bi
  })
}

export default function CatalogueOrderForm({
  skillKey,
  title,
  subtitle,
  onSubmit,
  excludeLabels = [],
}: {
  skillKey: string
  title: string
  subtitle?: string
  onSubmit: (summary: string, payload: Record<string, unknown>) => Promise<void>
  excludeLabels?: string[]
}) {
  const [catalog, setCatalog] = useState<SkillAction[]>([])
  const [selectedKey, setSelectedKey] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [notes, setNotes] = useState('')
  const [basket, setBasket] = useState<BasketLine[]>([])
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      let actions = await getSkillActions()
      let skillActions = actions.filter((action) =>
        action.skill_key === skillKey &&
        action.reward_label &&
        !excludeLabels.some((label) => action.reward_label.toLowerCase() === label.toLowerCase())
      )
      if (!skillActions.length) {
        setMessage('Loading the official Koruxa ' + title.toLowerCase() + ' catalogue…')
        await apiPost('/api/catalog/wiki-sync', { skill_key: skillKey })
        actions = await getSkillActions()
        skillActions = actions.filter((action) =>
          action.skill_key === skillKey &&
          action.reward_label &&
          !excludeLabels.some((label) => action.reward_label.toLowerCase() === label.toLowerCase())
        )
      }
      setCatalog(skillActions)
      if (skillActions[0]) setSelectedKey((current) => current || skillActions[0].action_key)
      setMessage(skillActions.length ? '' : 'No orderable items were found for this skill yet.')
    } catch (error: any) {
      setMessage(error.message ?? 'Could not load the Koruxa catalogue.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [skillKey])

  const selected = catalog.find((action) => action.action_key === selectedKey) ?? catalog[0]
  const groups = useMemo(() => {
    const map = new Map<string, SkillAction[]>()
    for (const action of catalog) {
      const group = orderGroup(skillKey, action.reward_label, action.category)
      if (!map.has(group)) map.set(group, [])
      map.get(group)!.push(action)
    }
    for (const actions of map.values()) actions.sort((a, b) => a.min_level - b.min_level || a.reward_label.localeCompare(b.reward_label))
    return map
  }, [catalog, skillKey])
  const groupNames = preferredGroups(skillKey, [...groups.keys()])

  const selectedMaterials = selected ? materialLines(selected, Math.max(1, quantity)) : []

  const add = () => {
    if (!selected) return
    const qty = Math.max(1, Math.floor(quantity))
    setBasket((current) => {
      const existing = current.find((line) => line.action.action_key === selected.action_key)
      if (existing) {
        const nextQty = existing.quantity + qty
        return current.map((line) => line.id === existing.id
          ? { ...line, quantity: nextQty, materials: materialLines(selected, nextQty) }
          : line)
      }
      return [...current, {
        id: crypto.randomUUID(),
        action: selected,
        quantity: qty,
        materials: materialLines(selected, qty),
      }]
    })
  }

  const submit = async () => {
    if (!basket.length) return
    const lines = basket.map((line) => {
      const emoji = itemEmoji(line.displayActionLabel(action, skillKey), skillKey)
      const mats = line.materials.map((material) => ({
        item: prettyItemKey(material.item),
        item_key: material.item,
        quantity: material.quantity,
      }))
      return {
        item: label,
        item_key: line.action.reward_item_key,
        action_key: line.action.action_key,
        skill_key: skillKey,
        quantity: line.quantity,
        emoji,
        materials: mats,
        description: emoji + ' ' + line.quantity.toLocaleString() + ' × ' + label,
      }
    })
    await onSubmit(title + ' order', {
      form: 'catalogue',
      skill_key: skillKey,
      lines,
      notes: notes.trim(),
    })
    setBasket([])
    setNotes('')
  }

  return (
    <div className="catalogue-order-board">
      <div className="board-heading catalogue-heading">
        <span>OFFICIAL KORUXA CATALOGUE</span>
        <h2>{title} Order Board</h2>
        <p>{subtitle ?? 'Choose an item, enter the amount, and the required crafting materials are shown automatically.'}</p>
      </div>

      {message ? <div className="notice">{message}</div> : null}
      {loading ? <div className="order-catalogue-loading">Loading items…</div> : null}

      {!loading && groupNames.map((group) => (
        <section className="item-button-group" key={group}>
          <div className="item-button-group-title"><span>{group}</span><small>{groups.get(group)?.length ?? 0} items</small></div>
          <div className="item-button-grid">
            {(groups.get(group) ?? []).map((action) => (
              <button
                type="button"
                key={action.action_key}
                className={selected?.action_key === action.action_key ? 'item-choice active' : 'item-choice'}
                onClick={() => setSelectedKey(action.action_key)}
              >
                <span className="item-choice-emoji">{itemEmoji(displayActionLabel(action, skillKey), skillKey)}</span>
                <span><strong>{displayActionLabel(action, skillKey)}</strong><small>Lv {action.min_level}</small></span>
              </button>
            ))}
          </div>
        </section>
      ))}

      {selected ? <div className="selected-order-builder">
        <div className="selected-item-head">
          <div className="selected-item-icon">{itemEmoji(selected.reward_label, skillKey)}</div>
          <div><span className="eyebrow">SELECTED ITEM</span><h3>{displayActionLabel(selected, skillKey)}</h3><small>Koruxa {title} Lv {selected.min_level}</small></div>
        </div>

        <div className="selected-item-controls">
          <label>Quantity
            <input type="number" min={1} value={quantity} onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))} />
          </label>
          <button type="button" className="exchange-add" onClick={add}>+ Add to order</button>
        </div>

        <div className="materials-box">
          <div className="materials-title"><span>REQUIRED MATERIALS</span><small>for {Math.max(1, quantity).toLocaleString()} × {displayActionLabel(selected, skillKey)}</small></div>
          {selectedMaterials.length ? selectedMaterials.map((material) => (
            <div className="material-chip-line" key={material.item}>
              <span>{itemEmoji(prettyItemKey(material.item))} {prettyItemKey(material.item)}</span>
              <strong>{material.quantity.toLocaleString()}</strong>
            </div>
          )) : <p className="empty">No material requirement is listed for this Koruxa action.</p>}
        </div>
      </div> : null}

      <div className="order-preview-board">
        <div className="order-preview-title"><span>YOUR ORDER</span><strong>{basket.length} selected</strong></div>
        {basket.length ? basket.map((line) => (
          <div className="preview-material" key={line.id}>
            <div className="preview-row">
              <div><strong>{itemEmoji(line.displayActionLabel(action, skillKey), skillKey)} {line.quantity.toLocaleString()} × {line.action.reward_label}</strong><small>{line.materials.length ? line.materials.map((material) => material.quantity.toLocaleString() + ' ' + prettyItemKey(material.item)).join(' · ') : 'No listed materials'}</small></div>
              <button type="button" onClick={() => setBasket((current) => current.filter((entry) => entry.id !== line.id))}>Remove</button>
            </div>
          </div>
        )) : <p className="empty">Choose items above to build the request.</p>}
      </div>

      <label>Order notes
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} maxLength={500} placeholder="Optional notes for the crafter…" />
      </label>
      <button type="button" className="exchange-submit" disabled={!basket.length} onClick={submit}>Submit {title.toLowerCase()} order</button>
    </div>
  )
}
