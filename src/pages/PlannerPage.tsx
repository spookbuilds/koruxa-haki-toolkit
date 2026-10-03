import { useEffect, useMemo, useState } from 'react'
import MaterialTree from '../components/MaterialTree'
import { getSkillActions, getXpTable } from '../lib/data'
import { actionsForTargetLevel, buildMaterialTree, flattenRawMaterials, formatDuration } from '../lib/planner'
import type { SkillAction } from '../types'

export default function PlannerPage() {
  const [catalog, setCatalog] = useState<SkillAction[]>([])
  const [xpTable, setXpTable] = useState<number[]>([])
  const [actionKey, setActionKey] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [currentXp, setCurrentXp] = useState(0)
  const [targetLevel, setTargetLevel] = useState(100)
  const [xpPct, setXpPct] = useState(0)
  const [speedPct, setSpeedPct] = useState(0)
  const [yieldPct, setYieldPct] = useState(0)
  const [materialSavePct, setMaterialSavePct] = useState(0)
  const [outputMult, setOutputMult] = useState(1)

  useEffect(() => {
    Promise.all([getSkillActions(), getXpTable()]).then(([actions, table]) => {
      setCatalog(actions)
      setXpTable(table)
      if (actions[0]) setActionKey(actions[0].action_key)
    })
  }, [])

  const action = catalog.find((entry) => entry.action_key === actionKey)
  const tree = useMemo(() => action ? buildMaterialTree(action, quantity, catalog) : null, [action, quantity, catalog])
  const raw = useMemo(() => tree ? flattenRawMaterials(tree) : [], [tree])
  const estimate = useMemo(() => action && xpTable.length
    ? actionsForTargetLevel(action, currentXp, targetLevel, xpTable, { xpPct, speedPct, yieldPct, materialSavePct, outputMult })
    : null, [action, xpTable, currentXp, targetLevel, xpPct, speedPct, yieldPct, materialSavePct, outputMult])

  return (
    <div className="page">
      <header className="page-header"><div><span className="eyebrow">PERSONALISED PLANNING</span><h1>Skill Planner</h1><p className="muted">Build material trees now; live modifier auto-fill will use the bot/public API as available.</p></div></header>

      <section className="panel">
        <div className="form-grid">
          <label>Action<select value={actionKey} onChange={(e) => setActionKey(e.target.value)}>{catalog.map((entry) => <option key={entry.action_key} value={entry.action_key}>{entry.skill_key} · {entry.label}</option>)}</select></label>
          <label>Output quantity<input type="number" min={1} value={quantity} onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))} /></label>
        </div>
      </section>

      {tree ? <div className="two-column">
        <section className="panel"><div className="panel-title"><div><span className="eyebrow">STEP BY STEP</span><h2>Material tree</h2></div></div><MaterialTree root={tree} /></section>
        <section className="panel"><div className="panel-title"><div><span className="eyebrow">SHOPPING / GATHERING</span><h2>Complete raw list</h2></div></div>{raw.length ? raw.map((item) => <div className="list-row" key={item.itemKey}><strong>{item.label}</strong><span>{item.quantity.toLocaleString()}</span></div>) : <p className="empty">This action is already a raw gathering action.</p>}</section>
      </div> : null}

      <section className="panel">
        <div className="panel-title"><div><span className="eyebrow">WHAT IF?</span><h2>Level target calculator</h2><p className="muted">Manual modifier controls are intentional until Koruxa exposes final skill bonuses through the token-safe API.</p></div></div>
        <div className="form-grid">
          <label>Current exact XP<input type="number" min={0} value={currentXp} onChange={(e) => setCurrentXp(Number(e.target.value))} /></label>
          <label>Target level<input type="number" min={2} max={150} value={targetLevel} onChange={(e) => setTargetLevel(Number(e.target.value))} /></label>
          <label>XP bonus %<input type="number" value={xpPct} onChange={(e) => setXpPct(Number(e.target.value))} /></label>
          <label>Speed bonus %<input type="number" value={speedPct} onChange={(e) => setSpeedPct(Number(e.target.value))} /></label>
          <label>Yield bonus %<input type="number" value={yieldPct} onChange={(e) => setYieldPct(Number(e.target.value))} /></label>
          <label>Material save %<input type="number" value={materialSavePct} onChange={(e) => setMaterialSavePct(Number(e.target.value))} /></label>
          <label>Output multiplier<input type="number" min={1} step={0.05} value={outputMult} onChange={(e) => setOutputMult(Number(e.target.value))} /></label>
        </div>
        {estimate ? <div className="stat-grid mini">
          <div className="mini-stat"><span>Actions</span><strong>{estimate.actions.toLocaleString()}</strong></div>
          <div className="mini-stat"><span>XP / action</span><strong>{estimate.effectiveXpPerAction.toFixed(2)}</strong></div>
          <div className="mini-stat"><span>Time</span><strong>{formatDuration(estimate.expectedSeconds)}</strong></div>
          <div className="mini-stat"><span>Output / action</span><strong>{estimate.expectedOutputPerAction.toFixed(2)}</strong></div>
        </div> : <div className="notice">Import any Koruxa skill export in Admin to store the shared XP table and unlock level-target calculations.</div>}
      </section>
    </div>
  )
}
