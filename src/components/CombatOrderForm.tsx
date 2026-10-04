import { useEffect, useMemo, useState } from 'react'
import { apiGet, apiPut } from '../lib/api'
import { itemEmoji } from '../data/orderVisuals'
import combatHeader from '../../assets/images/orders/combat-header.png'

type MonsterIndex = { key: string; name: string; slayer_only?: boolean }

type CombatDrop = {
  item: string
  item_key: string
  qty: string
  chance: string
}

type CombatMonster = {
  key: string
  name: string
  area?: string | null
  combat_level?: number | null
  type?: string | null
  slayer_only?: boolean
  suppliers: string[]
  drops: CombatDrop[]
}

type CombatItem = {
  item: string
  item_key: string
  sources: Array<{
    monster_key: string
    monster_name: string
    area?: string | null
    combat_level?: number | null
    qty: string
    chance: string
    suppliers: string[]
  }>
}

type BasketLine = {
  id: string
  item: CombatItem
  quantity: number
}

function dropGroup(label: string) {
  const value = label.toLowerCase()
  if (value.includes('spirit extract') || value.includes('slayer') || value.includes('essence')) return 'Extracts & Slayer Supplies'
  if (value.includes('bone') || value.includes('ashes')) return 'Bones & Ashes'
  if (value.includes('ore') || value.includes('bar')) return 'Ore & Bars'
  if (value.includes('seed') || value.includes('compost') || value.includes('hide') || value.includes('log') || value.includes('herb')) return 'General Supplies'
  if (value.includes('rune') || value.includes('arrow') || value.includes('bolt')) return 'Runes & Ammunition'
  if (
    /[⭐🌙☀️]/.test(label) ||
    value.includes('sword') || value.includes('longsword') || value.includes('shield') ||
    value.includes('chestplate') || value.includes('helmet') || value.includes('gloves') ||
    value.includes('boots') || value.includes('leggings') || value.includes('staff') ||
    value.includes('bow') || value.includes('crossbow') || value.includes('robe') ||
    value.includes('hat') || value.includes('shoes') || value.includes('skirt') ||
    value.includes('wraps') || value.includes('hood') || value.includes('tunic') ||
    value.includes('bracers') || value.includes('cloak')
  ) return 'Gear & Rare Drops'
  if (value.includes('cooked ') || value.includes('raw ')) return 'Food & Fish'
  return 'Other Drops'
}

const groupOrder = [
  'Extracts & Slayer Supplies',
  'General Supplies',
  'Ore & Bars',
  'Runes & Ammunition',
  'Bones & Ashes',
  'Food & Fish',
  'Gear & Rare Drops',
  'Other Drops',
]

export default function CombatOrderForm({
  onSubmit,
}: {
  onSubmit: (summary: string, payload: Record<string, unknown>) => Promise<void>
}) {
  const [monsters, setMonsters] = useState<CombatMonster[]>([])
  const [monsterIndex, setMonsterIndex] = useState<MonsterIndex[]>([])
  const [selectedMobs, setSelectedMobs] = useState<string[]>([])
  const [canManage, setCanManage] = useState(false)
  const [managerSearch, setManagerSearch] = useState('')
  const [itemSearch, setItemSearch] = useState('')
  const [monsterFilter, setMonsterFilter] = useState('all')
  const [selectedItemKey, setSelectedItemKey] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [basket, setBasket] = useState<BasketLine[]>([])
  const [notes, setNotes] = useState('')
  const [message, setMessage] = useState('')
  const [savingMobs, setSavingMobs] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      const [prefs, drops] = await Promise.all([
        apiGet<{ can_manage: boolean; monsters: MonsterIndex[]; selected: MonsterIndex[] }>('/api/combat/monsters'),
        apiGet<{ monsters: CombatMonster[] }>('/api/combat/available-drops'),
      ])
      setCanManage(Boolean(prefs.can_manage))
      setMonsterIndex(prefs.monsters ?? [])
      setSelectedMobs((prefs.selected ?? []).map((monster) => monster.key))
      setMonsters(drops.monsters ?? [])
    } catch (error: any) {
      setMessage(error.message ?? 'Could not load Combat shop data.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const items = useMemo(() => {
    const map = new Map<string, CombatItem>()

    for (const monster of monsters) {
      if (monsterFilter !== 'all' && monster.key !== monsterFilter) continue
      for (const drop of monster.drops ?? []) {
        const key = drop.item_key || drop.item.toLowerCase()
        if (!map.has(key)) {
          map.set(key, {
            item: drop.item,
            item_key: key,
            sources: [],
          })
        }
        map.get(key)!.sources.push({
          monster_key: monster.key,
          monster_name: monster.name,
          area: monster.area,
          combat_level: monster.combat_level,
          qty: drop.qty,
          chance: drop.chance,
          suppliers: monster.suppliers ?? [],
        })
      }
    }

    return [...map.values()]
      .filter((item) => !itemSearch || item.item.toLowerCase().includes(itemSearch.toLowerCase()))
      .sort((a, b) => {
        const ga = groupOrder.indexOf(dropGroup(a.item))
        const gb = groupOrder.indexOf(dropGroup(b.item))
        if (ga !== gb) return ga - gb
        return a.item.localeCompare(b.item)
      })
  }, [monsters, monsterFilter, itemSearch])

  const grouped = useMemo(() => {
    const map = new Map<string, CombatItem[]>()
    for (const item of items) {
      const group = dropGroup(item.item)
      if (!map.has(group)) map.set(group, [])
      map.get(group)!.push(item)
    }
    return map
  }, [items])

  const selectedItem = items.find((item) => item.item_key === selectedItemKey)
    ?? [...grouped.values()].flat()[0]

  const saveMobs = async () => {
    try {
      setSavingMobs(true)
      setMessage('Saving your Combat farming list and loading the selected Koruxa drop tables…')
      const result: any = await apiPut('/api/combat/monsters', { monsters: selectedMobs })
      setMessage(
        'Combat farming list saved: ' + Number(result.selected ?? selectedMobs.length) + ' monsters.' +
        (Array.isArray(result.warnings) && result.warnings.length ? ' Some wiki pages could not refresh: ' + result.warnings.join(' | ') : '')
      )
      await load()
    } catch (error: any) {
      setMessage(error.message ?? 'Could not save Combat farming preferences.')
    } finally {
      setSavingMobs(false)
    }
  }

  const add = () => {
    if (!selectedItem) return
    const qty = Math.max(1, Math.floor(Number(quantity) || 1))
    setBasket((current) => {
      const existing = current.find((line) => line.item.item_key === selectedItem.item_key)
      if (existing) {
        return current.map((line) => line.id === existing.id ? { ...line, quantity: line.quantity + qty } : line)
      }
      return [...current, { id: crypto.randomUUID(), item: selectedItem, quantity: qty }]
    })
  }

  const submit = async () => {
    if (!basket.length) return

    const lines = basket.map((line) => ({
      item: line.item.item,
      item_key: line.item.item_key,
      quantity: line.quantity,
      emoji: itemEmoji(line.item.item),
      description: itemEmoji(line.item.item) + ' ' + line.quantity.toLocaleString() + ' × ' + line.item.item,
      source_monsters: line.item.sources.map((source) => ({
        monster_key: source.monster_key,
        monster: source.monster_name,
        area: source.area,
        combat_level: source.combat_level,
        drop_qty: source.qty,
        drop_chance: source.chance,
        available_suppliers: source.suppliers,
      })),
    }))

    await onSubmit('Combat drops order', {
      form: 'combat-drops',
      lines,
      notes: notes.trim(),
    })

    setBasket([])
    setNotes('')
  }

  const managerResults = monsterIndex
    .filter((monster) => !managerSearch || monster.name.toLowerCase().includes(managerSearch.toLowerCase()))

  const normalMonsterResults = managerResults.filter((monster) => !monster.slayer_only)
  const slayerMonsterResults = managerResults.filter((monster) => monster.slayer_only)

  const monsterPicker = (items: MonsterIndex[], emptyText: string) => (
    <div className="combat-monster-picker">
      {items.length ? items.map((monster) => {
        const checked = selectedMobs.includes(monster.key)
        return <button
          type="button"
          key={monster.key}
          className={checked ? 'combat-monster-option selected' : 'combat-monster-option'}
          onClick={() => setSelectedMobs((current) => checked ? current.filter((key) => key !== monster.key) : [...current, monster.key])}
        >
          <span>{checked ? '✓' : '+'}</span>
          <strong>{monster.name}</strong>
        </button>
      }) : <div className="empty">{emptyText}</div>}
    </div>
  )

  return (
    <div className="catalogue-order-board combat-order-board">
      <div
        className="board-heading catalogue-heading board-heading-art"
        style={{ backgroundImage: `linear-gradient(90deg, rgba(14,10,18,.92), rgba(37,18,31,.58) 55%, rgba(9,11,17,.80)), url(${combatHeader})` }}
      >
        <span>LIVE KORUXA DROP TABLES</span>
        <h2>Combat Drops Order Board</h2>
        <p>Only drops from monsters an available Combat supplier has explicitly chosen to farm can be ordered here.</p>
      </div>

      {canManage ? <details className="combat-farm-manager">
        <summary>⚔️ Manage monsters I’m willing to farm <span>{selectedMobs.length} selected</span></summary>
        <div className="combat-farm-manager-body">
          <p className="muted">Pick only monsters you are genuinely happy to farm for other members. These choices directly control which Combat drops appear in the shop while you are marked Available.</p>
          <input
            value={managerSearch}
            onChange={(event) => setManagerSearch(event.target.value)}
            placeholder="Search monsters…"
          />
          <div className="combat-monster-sections">
            <details className="combat-monster-section" open>
              <summary>
                <span>⚔️ Normal monsters</span>
                <strong>{normalMonsterResults.length}</strong>
              </summary>
              {monsterPicker(normalMonsterResults, 'No normal monsters match this search.')}
            </details>

            <details className="combat-monster-section">
              <summary>
                <span>💀 Slayer task monsters</span>
                <strong>{slayerMonsterResults.length}</strong>
              </summary>
              <p className="muted combat-slayer-note">These are task-only Slayer monsters. Select them only if you are happy to farm them when you have the appropriate Slayer task.</p>
              {monsterPicker(slayerMonsterResults, 'No Slayer monsters match this search.')}
            </details>
          </div>
          <button type="button" className="primary-button" disabled={savingMobs} onClick={saveMobs}>
            {savingMobs ? 'Saving & loading drops…' : 'Save monsters I will farm'}
          </button>
        </div>
      </details> : null}

      {message ? <div className="notice">{message}</div> : null}
      {loading ? <div className="order-catalogue-loading">Loading available Combat drops…</div> : null}

      {!loading && monsters.length === 0 ? <div className="shop-warning danger">
        <strong>⚠ No Combat monsters are currently available</strong>
        <span>A designated Combat supplier needs to be Available and select at least one monster they are willing to farm.</span>
      </div> : null}

      {monsters.length ? <>
        <div className="combat-drop-filters">
          <label>Monster
            <select value={monsterFilter} onChange={(event) => setMonsterFilter(event.target.value)}>
              <option value="all">All available monsters</option>
              {monsters.map((monster) => (
                <option value={monster.key} key={monster.key}>
                  {monster.name}{monster.combat_level ? ' · Combat ' + monster.combat_level : ''}
                </option>
              ))}
            </select>
          </label>
          <label>Find a drop
            <input value={itemSearch} onChange={(event) => setItemSearch(event.target.value)} placeholder="Spirit Extract, bars, seeds…" />
          </label>
        </div>

        <div className="combat-available-mobs">
          {monsters.map((monster) => (
            <span key={monster.key} className="combat-available-mob">
              <strong>{monster.name}</strong>
              <small>{monster.suppliers.join(', ')}</small>
            </span>
          ))}
        </div>

        {groupOrder.filter((group) => grouped.has(group)).map((group) => (
          <section className="item-button-group" key={group}>
            <div className="item-button-group-title">
              <span>{group}</span>
              <small>{grouped.get(group)?.length ?? 0} items</small>
            </div>
            <div className="item-button-grid">
              {(grouped.get(group) ?? []).map((item) => (
                <button
                  type="button"
                  key={item.item_key}
                  className={selectedItem?.item_key === item.item_key ? 'item-choice active' : 'item-choice'}
                  onClick={() => setSelectedItemKey(item.item_key)}
                >
                  <span className="item-choice-emoji">{itemEmoji(item.item)}</span>
                  <span>
                    <strong>{item.item}</strong>
                    <small>{item.sources.length} available monster{item.sources.length === 1 ? '' : 's'}</small>
                  </span>
                </button>
              ))}
            </div>
          </section>
        ))}

        {selectedItem ? <div className="selected-order-builder">
          <div className="selected-item-head">
            <div className="selected-item-icon">{itemEmoji(selectedItem.item)}</div>
            <div>
              <span className="eyebrow">SELECTED DROP</span>
              <h3>{selectedItem.item}</h3>
              <small>Currently farmable from {selectedItem.sources.length} monster{selectedItem.sources.length === 1 ? '' : 's'}</small>
            </div>
          </div>

          <div className="combat-drop-sources">
            {selectedItem.sources.map((source) => (
              <div className="combat-drop-source" key={source.monster_key}>
                <div>
                  <strong>{source.monster_name}</strong>
                  <span>{source.area ?? 'Koruxa Combat'}{source.combat_level ? ' · Combat ' + source.combat_level : ''}</span>
                </div>
                <div>
                  <strong>{source.chance}</strong>
                  <span>Qty {source.qty}</span>
                </div>
                <small>Farmed by {source.suppliers.join(', ')}</small>
              </div>
            ))}
          </div>

          <div className="selected-item-controls">
            <label>Quantity wanted
              <input type="number" min={1} value={quantity} onChange={(event) => setQuantity(Math.max(1, Number(event.target.value)))} />
            </label>
            <button type="button" className="exchange-add" onClick={add}>+ Add to order</button>
          </div>
        </div> : null}
      </> : null}

      <div className="order-preview-board">
        <div className="order-preview-title"><span>YOUR COMBAT ORDER</span><strong>{basket.length} selected</strong></div>
        {basket.length ? basket.map((line) => (
          <div className="preview-material" key={line.id}>
            <div className="preview-row">
              <div>
                <strong>{itemEmoji(line.item.item)} {line.quantity.toLocaleString()} × {line.item.item}</strong>
                <small>Available from {line.item.sources.map((source) => source.monster_name).join(' · ')}</small>
              </div>
              <button type="button" onClick={() => setBasket((current) => current.filter((entry) => entry.id !== line.id))}>Remove</button>
            </div>
          </div>
        )) : <p className="empty">No drops added yet. Choose one above to start your order.</p>}
      </div>

      <label>Order notes
        <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} maxLength={500} placeholder="Optional quantity/farming notes…" />
      </label>

      <button type="button" className="exchange-submit" disabled={!basket.length} onClick={submit}>
        Submit combat drops order
      </button>
    </div>
  )
}
