import { FormEvent, useEffect, useMemo, useState } from 'react'
import { apiDelete, apiGet, apiPatch, apiPost } from '../lib/api'
import { buffPresets, formatBuffDuration } from '../data/buffPresets'
import type { Profile } from '../types'

export type ModifierSummary = {
  xpPct: number
  speedPct: number
  yieldPct: number
  materialSavePct: number
  outputMult: number
}

type Modifier = {
  id: string
  category: 'server' | 'food' | 'potion' | 'farm' | 'firepit' | 'clan' | 'event' | 'other'
  label: string
  xp_pct: number
  speed_pct: number
  yield_pct: number
  material_save_pct: number
  output_mult: number
  active: boolean
  expires_at: string | null
}

const zeroSummary: ModifierSummary = { xpPct: 0, speedPct: 0, yieldPct: 0, materialSavePct: 0, outputMult: 1 }

export default function ModifierManager({ profile, onSummary }: { profile: Profile | null; onSummary: (summary: ModifierSummary) => void }) {
  const [rows, setRows] = useState<Modifier[]>([])
  const [presetId, setPresetId] = useState('skiller')
  const [customMode, setCustomMode] = useState(false)
  const [category, setCategory] = useState<Modifier['category']>('server')
  const [label, setLabel] = useState('')
  const [xp, setXp] = useState(0)
  const [speed, setSpeed] = useState(0)
  const [yieldPct, setYieldPct] = useState(0)
  const [materialSave, setMaterialSave] = useState(0)
  const [outputMult, setOutputMult] = useState(1)
  const [expiresAt, setExpiresAt] = useState('')
  const [message, setMessage] = useState('')

  const load = async () => {
    if (!profile) return setRows([])
    try {
      const data = await apiGet<{ modifiers: Modifier[] }>('/api/modifiers')
      setRows(data.modifiers ?? [])
    } catch (error: any) {
      setMessage(error.message)
    }
  }

  useEffect(() => { load() }, [profile?.id])

  const selectedPreset = buffPresets.find((preset) => preset.id === presetId) ?? buffPresets[0]

  const summary = useMemo(() => {
    const now = Date.now()
    let xpMultiplier = 1
    let speedMultiplier = 1
    let yieldTotal = 0
    let saveTotal = 0
    let output = 1

    for (const row of rows) {
      if (!row.active) continue
      if (row.expires_at && new Date(row.expires_at).getTime() <= now) continue
      xpMultiplier *= 1 + Number(row.xp_pct ?? 0) / 100
      speedMultiplier *= 1 + Number(row.speed_pct ?? 0) / 100
      yieldTotal += Number(row.yield_pct ?? 0)
      saveTotal += Number(row.material_save_pct ?? 0)
      output *= Number(row.output_mult ?? 1)
    }

    return {
      xpPct: (xpMultiplier - 1) * 100,
      speedPct: (speedMultiplier - 1) * 100,
      yieldPct: yieldTotal,
      materialSavePct: saveTotal,
      outputMult: output,
    }
  }, [rows])

  useEffect(() => {
    onSummary(summary)
  }, [summary.xpPct, summary.speedPct, summary.yieldPct, summary.materialSavePct, summary.outputMult])

  const addKnownBuff = async () => {
    if (!selectedPreset) return
    try {
      const expires = selectedPreset.durationSeconds
        ? new Date(Date.now() + selectedPreset.durationSeconds * 1000).toISOString()
        : null

      await apiPost('/api/modifiers', {
        category: selectedPreset.category,
        label: selectedPreset.label,
        xp_pct: selectedPreset.xpPct,
        speed_pct: selectedPreset.speedPct,
        yield_pct: selectedPreset.yieldPct,
        material_save_pct: selectedPreset.materialSavePct,
        output_mult: selectedPreset.outputMult,
        expires_at: expires,
      })

      setMessage(selectedPreset.label + ' added with its official values.')
      await load()
    } catch (error: any) {
      setMessage(error.message)
    }
  }

  const addCustom = async (event: FormEvent) => {
    event.preventDefault()
    try {
      await apiPost('/api/modifiers', {
        category,
        label: label.trim(),
        xp_pct: xp,
        speed_pct: speed,
        yield_pct: yieldPct,
        material_save_pct: materialSave,
        output_mult: outputMult || 1,
        expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
      })
      setLabel('')
      setXp(0)
      setSpeed(0)
      setYieldPct(0)
      setMaterialSave(0)
      setOutputMult(1)
      setExpiresAt('')
      setMessage('Custom modifier added.')
      await load()
    } catch (error: any) {
      setMessage(error.message)
    }
  }

  const toggle = async (row: Modifier) => {
    await apiPatch('/api/modifiers/' + row.id, { active: !row.active })
    await load()
  }

  const remove = async (id: string) => {
    await apiDelete('/api/modifiers/' + id)
    await load()
  }

  const potionPresets = buffPresets.filter((preset) => preset.category === 'potion')
  const firepitPresets = buffPresets.filter((preset) => preset.category === 'firepit')
  const eventPresets = buffPresets.filter((preset) => preset.category === 'event')

  return (
    <section className="panel">
      <div className="panel-title">
        <div>
          <span className="eyebrow">TEMPORARY / SERVER EFFECTS</span>
          <h2>Active boosts</h2>
          <p className="muted">Choose a known Koruxa buff and the toolkit fills its values and duration automatically. Premium, farms, equipped gear and Institute bonuses are handled separately from your synced account data.</p>
        </div>
      </div>

      <div className="modifier-preset-grid">
        <label>Known buff
          <select value={presetId} onChange={(e) => { setPresetId(e.target.value); setCustomMode(false) }}>
            <optgroup label="Potions">
              {potionPresets.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
            </optgroup>
            <optgroup label="Clan Firepit">
              {firepitPresets.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
            </optgroup>
            <optgroup label="Events">
              {eventPresets.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
            </optgroup>
          </select>
        </label>

        <div className="modifier-preset-card">
          <div>
            <strong>{selectedPreset.label}</strong>
            <span>{selectedPreset.effect}</span>
          </div>
          <div className="modifier-preset-stats">
            {selectedPreset.xpPct ? <span>XP +{selectedPreset.xpPct}%</span> : null}
            {selectedPreset.speedPct ? <span>Speed +{selectedPreset.speedPct}%</span> : null}
            <span>{formatBuffDuration(selectedPreset.durationSeconds)}</span>
            {!selectedPreset.xpPct && !selectedPreset.speedPct ? <span>No crafting XP/time effect</span> : null}
          </div>
        </div>

        <button className="primary-button" type="button" onClick={addKnownBuff}>Add known buff</button>
        <button className="ghost-button" type="button" onClick={() => setCustomMode((value) => !value)}>{customMode ? 'Hide custom modifier' : 'Add custom / unknown boost'}</button>
      </div>

      {customMode ? <form className="modifier-form" onSubmit={addCustom}>
        <label>Type<select value={category} onChange={(e) => setCategory(e.target.value as Modifier['category'])}><option value="server">Server boost</option><option value="food">Food</option><option value="potion">Potion</option><option value="firepit">Firepit</option><option value="clan">Clan perk</option><option value="event">Event</option><option value="farm">Farm effect</option><option value="other">Other</option></select></label>
        <label className="wide-field">Name<input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Only use this for a buff not listed above" required /></label>
        <label>XP %<input type="number" step="0.001" value={xp} onChange={(e) => setXp(Number(e.target.value))} /></label>
        <label>Speed %<input type="number" step="0.001" value={speed} onChange={(e) => setSpeed(Number(e.target.value))} /></label>
        <label>Yield %<input type="number" step="0.001" value={yieldPct} onChange={(e) => setYieldPct(Number(e.target.value))} /></label>
        <label>Material save %<input type="number" step="0.001" value={materialSave} onChange={(e) => setMaterialSave(Number(e.target.value))} /></label>
        <label>Output multiplier<input type="number" min="0.01" step="0.01" value={outputMult} onChange={(e) => setOutputMult(Number(e.target.value))} /></label>
        <label>Expires at<input type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} /></label>
        <button className="primary-button">Add custom boost</button>
      </form> : null}

      {message ? <p className="notice">{message}</p> : null}

      <div className="stat-grid mini">
        <div className="mini-stat"><span>Combined XP</span><strong>+{summary.xpPct.toFixed(3)}%</strong></div>
        <div className="mini-stat"><span>Combined speed</span><strong>+{summary.speedPct.toFixed(3)}%</strong></div>
        <div className="mini-stat"><span>Active yield</span><strong>+{summary.yieldPct.toFixed(3)}%</strong></div>
        <div className="mini-stat"><span>Material save</span><strong>+{summary.materialSavePct.toFixed(3)}%</strong></div>
      </div>

      {rows.map((row) => {
        const expired = Boolean(row.expires_at && new Date(row.expires_at).getTime() <= Date.now())
        return <div className="list-row" key={row.id}>
          <div>
            <strong>{row.label}</strong>
            <span>
              {row.category}
              {Number(row.xp_pct) ? ' · XP +' + Number(row.xp_pct) + '%' : ''}
              {Number(row.speed_pct) ? ' · Speed +' + Number(row.speed_pct) + '%' : ''}
              {Number(row.yield_pct) ? ' · Yield +' + Number(row.yield_pct) + '%' : ''}
              {row.expires_at ? ' · expires ' + new Date(row.expires_at).toLocaleString() : ''}
            </span>
          </div>
          <div className="row-actions">
            <button className="secondary-button" type="button" onClick={() => toggle(row)}>{expired ? 'Expired' : row.active ? 'Active' : 'Paused'}</button>
            <button className="ghost-button" type="button" onClick={() => remove(row.id)}>Remove</button>
          </div>
        </div>
      })}
    </section>
  )
}
