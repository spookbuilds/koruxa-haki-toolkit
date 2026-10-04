import { useEffect, useMemo, useState } from 'react'
import { apiGet, apiPut } from '../lib/api'

export type SupplierOfferOption = {
  key: string
  label: string
  group?: string
  skillKey?: string | null
  minLevel?: number | null
}

type SupplierOffer = {
  key: string
  label: string
  skill_key?: string | null
  min_level?: number | null
  eligible: boolean
  current_level?: number | null
}

type Supplier = {
  profile_id: string
  name: string
  status: 'available' | 'busy'
  is_self: boolean
  offers: SupplierOffer[]
  skill_levels?: Record<string, number>
}

type SupplierResponse = {
  category_id: string
  can_manage: boolean
  suppliers: Supplier[]
}

function optionAbilityText(option: SupplierOfferOption, currentLevel: number | null | undefined) {
  if (!option.skillKey || !option.minLevel) return 'No level requirement tracked'
  if (currentLevel == null) return option.skillKey + ' Lv ' + option.minLevel + ' · skill data not synced'
  if (currentLevel >= option.minLevel) return option.skillKey + ' Lv ' + currentLevel + ' · unlocked'
  return option.skillKey + ' Lv ' + currentLevel + ' · unlocks at Lv ' + option.minLevel
}

export default function SupplierOfferPanel({
  categoryId,
  options,
  selectedKey,
  basketKeys = [],
  onCoverageChange,
}: {
  categoryId: string
  options: SupplierOfferOption[]
  selectedKey?: string
  basketKeys?: string[]
  onCoverageChange?: (selectedKeys: Set<string>) => void
}) {
  const [data, setData] = useState<SupplierResponse | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const load = async () => {
    try {
      const result = await apiGet<SupplierResponse>('/api/order-supplier-offers/' + encodeURIComponent(categoryId))
      setData(result)
      const me = result.suppliers.find((supplier) => supplier.is_self)
      setSelected(new Set((me?.offers ?? []).map((offer) => offer.key)))
    } catch (error: any) {
      setMessage(error.message ?? 'Could not load supplier coverage.')
    }
  }

  useEffect(() => {
    load()
  }, [categoryId])

  useEffect(() => {
    if (!data || !onCoverageChange) return
    const selectedKeys = new Set<string>()
    for (const supplier of data.suppliers) {
      for (const offer of supplier.offers) selectedKeys.add(offer.key)
    }
    onCoverageChange(selectedKeys)
  }, [data, onCoverageChange])

  const me = data?.suppliers.find((supplier) => supplier.is_self)
  const currentLevelFor = (option: SupplierOfferOption) => {
    if (!option.skillKey) return null
    const aliases: Record<string,string> = {
      jewellery: 'jewelery',
      runecrafting: 'arcana',
      rune_crafting: 'arcana',
      runecraft: 'arcana',
      arcane: 'arcana',
    }
    const raw = option.skillKey.toLowerCase()
    const key = aliases[raw] ?? raw
    return me?.skill_levels?.[key] ?? null
  }

  const filteredOptions = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return options.filter((option) => !needle || option.label.toLowerCase().includes(needle) || String(option.group || '').toLowerCase().includes(needle))
  }, [options, search])

  const groupedOptions = useMemo(() => {
    const map = new Map<string, SupplierOfferOption[]>()
    for (const option of filteredOptions) {
      const group = option.group || 'Items'
      if (!map.has(group)) map.set(group, [])
      map.get(group)!.push(option)
    }
    return map
  }, [filteredOptions])

  const save = async () => {
    try {
      setSaving(true)
      await apiPut('/api/order-supplier-offers/' + encodeURIComponent(categoryId), {
        scope: options.map((option) => ({
          key: option.key,
          label: option.label,
          skill_key: option.skillKey ?? null,
          min_level: option.minLevel ?? null,
        })),
        selected: [...selected],
      })
      setMessage('Your supplier list has been saved.')
      await load()
    } catch (error: any) {
      setMessage(error.message ?? 'Could not save supplier preferences.')
    } finally {
      setSaving(false)
    }
  }

  const selectUnlocked = () => {
    const next = new Set(selected)
    for (const option of options) {
      const level = currentLevelFor(option)
      if (!option.skillKey || !option.minLevel || (level != null && level >= option.minLevel)) {
        next.add(option.key)
      }
    }
    setSelected(next)
  }

  const supplierCoverage = (key?: string) => {
    if (!key) return { available: [] as Supplier[], busy: [] as Supplier[], locked: [] as Supplier[] }

    const willing = (data?.suppliers ?? []).filter((supplier) =>
      supplier.offers.some((offer) => offer.key === key)
    )

    return {
      available: willing.filter((supplier) =>
        supplier.status === 'available' &&
        supplier.offers.some((offer) => offer.key === key && offer.eligible)
      ),
      busy: willing.filter((supplier) =>
        supplier.status === 'busy' &&
        supplier.offers.some((offer) => offer.key === key && offer.eligible)
      ),
      locked: willing.filter((supplier) =>
        supplier.offers.some((offer) => offer.key === key && !offer.eligible)
      ),
    }
  }

  const selectedOption = options.find((option) => option.key === selectedKey)
  const selectedCoverage = supplierCoverage(selectedKey)

  const basketOptions = [...new Set(basketKeys)]
    .map((key) => options.find((option) => option.key === key))
    .filter(Boolean) as SupplierOfferOption[]

  return (
    <section className="supplier-capability-panel">
      {data?.can_manage ? <details className="supplier-capability-manager">
        <summary>
          <span>🧰 What I’m willing to supply</span>
          <strong>{selected.size} selected</strong>
        </summary>
        <div className="supplier-capability-manager-body">
          <p className="muted">Choose the exact items you are happy to fulfil. You can pre-select future unlocks too; they will not show you as an available supplier until your synced skill level reaches the requirement.</p>
          <div className="supplier-manager-actions">
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search this shop…" />
            <button type="button" className="secondary-button" onClick={selectUnlocked}>Select everything I can currently do</button>
            <button type="button" className="ghost-button" onClick={() => setSelected(new Set())}>Clear this list</button>
          </div>

          <div className="supplier-option-groups">
            {[...groupedOptions.entries()].map(([group, items]) => (
              <details className="supplier-option-group" key={group} open={groupedOptions.size <= 4}>
                <summary><span>{group}</span><strong>{items.filter((option) => selected.has(option.key)).length} / {items.length}</strong></summary>
                <div className="supplier-option-grid">
                  {items.map((option) => {
                    const checked = selected.has(option.key)
                    const currentLevel = currentLevelFor(option)
                    const locked = Boolean(option.skillKey && option.minLevel && (currentLevel == null || currentLevel < option.minLevel))
                    return <button
                      type="button"
                      key={option.key}
                      className={'supplier-option ' + (checked ? 'selected ' : '') + (locked ? 'locked' : '')}
                      onClick={() => setSelected((current) => {
                        const next = new Set(current)
                        if (next.has(option.key)) next.delete(option.key)
                        else next.add(option.key)
                        return next
                      })}
                    >
                      <span>{checked ? '✓' : '+'}</span>
                      <div>
                        <strong>{option.label}</strong>
                        <small>{optionAbilityText(option, currentLevel)}</small>
                      </div>
                    </button>
                  })}
                </div>
              </details>
            ))}
          </div>

          <button type="button" className="primary-button" disabled={saving} onClick={save}>
            {saving ? 'Saving…' : 'Save what I’m willing to supply'}
          </button>
        </div>
      </details> : null}

      {message ? <div className="notice">{message}</div> : null}

      {selectedOption ? <div className="supplier-selected-coverage">
        <div className="supplier-selected-title">
          <div>
            <span className="eyebrow">AVAILABLE SUPPLIERS</span>
            <h3>{selectedOption.label}</h3>
          </div>
          <strong>{selectedCoverage.available.length}</strong>
        </div>

        {selectedCoverage.available.length ? <div className="supplier-coverage-chips">
          {selectedCoverage.available.map((supplier) => (
            <span className="supplier-coverage-chip available" key={supplier.profile_id}>● {supplier.name}</span>
          ))}
        </div> : <div className="shop-warning danger">
          <strong>⚠ Nobody available for this item right now</strong>
          <span>
            {selectedCoverage.busy.length
              ? selectedCoverage.busy.map((supplier) => supplier.name).join(', ') + ' can supply it but ' + (selectedCoverage.busy.length === 1 ? 'is' : 'are') + ' currently marked Busy.'
              : selectedCoverage.locked.length
                ? 'A willing supplier has selected this item, but their synced skill level has not unlocked it yet.'
                : 'No currently available shop owner has selected this item as something they are willing and able to fulfil.'}
            {' '}You can still place the order, but it may remain unfilled.
          </span>
        </div>}

        {selectedCoverage.busy.length && selectedCoverage.available.length ? <div className="supplier-secondary-note">
          Busy for this item: {selectedCoverage.busy.map((supplier) => supplier.name).join(', ')}
        </div> : null}
      </div> : null}

      {basketOptions.length > 1 ? <div className="supplier-order-coverage">
        <div className="materials-title"><span>ORDER COVERAGE</span><small>live supplier availability</small></div>
        {basketOptions.map((option) => {
          const coverage = supplierCoverage(option.key)
          return <div className={'supplier-order-coverage-row ' + (coverage.available.length ? 'covered' : 'uncovered')} key={option.key}>
            <span>{option.label}</span>
            <strong>{coverage.available.length ? coverage.available.map((supplier) => supplier.name).join(', ') : 'No available supplier'}</strong>
          </div>
        })}
      </div> : null}
    </section>
  )
}
