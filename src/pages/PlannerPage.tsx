import { useEffect, useMemo, useState } from 'react'
import MaterialTree from '../components/MaterialTree'
import { getSkillActions, getXpTable } from '../lib/data'
import { actionsForTargetLevel, buildMaterialTree, flattenRawMaterials, formatDuration } from '../lib/planner'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import type { Profile, SkillAction } from '../types'

const artisanSkills = new Set(['cooking','smithing','crafting','fletching','herblore','jewelery','firemaking','construction','arcana'])

export default function PlannerPage({ currentProfile }: { currentProfile: Profile | null }) {
  const [catalog, setCatalog] = useState<SkillAction[]>([])
  const [xpTable, setXpTable] = useState<number[]>([])
  const [actionKey, setActionKey] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [currentXp, setCurrentXp] = useState(0)
  const [targetLevel, setTargetLevel] = useState(100)
  const [manualXpPct, setManualXpPct] = useState(0)
  const [manualSpeedPct, setManualSpeedPct] = useState(0)
  const [manualYieldPct, setManualYieldPct] = useState(0)
  const [materialSavePct, setMaterialSavePct] = useState(0)
  const [outputMult, setOutputMult] = useState(1)
  const [snapshot, setSnapshot] = useState<any>(null)
  const [privateState, setPrivateState] = useState<any>(null)

  useEffect(() => {
    Promise.all([getSkillActions(), getXpTable()]).then(([actions, table]) => {
      setCatalog(actions)
      setXpTable(table)
      if (actions[0]) setActionKey(actions[0].action_key)
    })
  }, [])

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase || !currentProfile) return
    supabase.from('latest_member_snapshots').select('*').eq('profile_id', currentProfile.id).maybeSingle().then(({ data }) => setSnapshot(data))
    supabase.from('member_private_state').select('*').eq('profile_id', currentProfile.id).maybeSingle().then(({ data }) => setPrivateState(data))
  }, [currentProfile?.id])

  const action = catalog.find((entry) => entry.action_key === actionKey)

  const liveKnown = useMemo(() => {
    if (!action || !snapshot) return { xp: 0, speed: 0, yield: 0, notes: [] as string[] }
    const notes: string[] = []
    let xp = 0
    let speed = 0
    let yieldPct = 0
    const equipment = snapshot.equipment ?? []
    const tool = equipment.find((item: any) => item.slot === 'tool_' + action.skill_key)
    if (tool) {
      speed += Number(tool.tool_speed ?? 0)
      xp += Number(tool.tool_xp ?? 0)
      yieldPct += Number(tool.tool_yield ?? 0)
      notes.push(String(tool.name) + ': +' + Number(tool.tool_speed ?? 0) + '% speed, +' + Number(tool.tool_xp ?? 0) + '% XP')
    }
    const jewelleryXp = equipment.filter((item: any) => item.slot === 'ring' || item.slot === 'neck').reduce((sum: number, item: any) => sum + Number(item.tool_xp ?? 0), 0)
    if (jewelleryXp) { xp += jewelleryXp; notes.push('Jewellery: +' + jewelleryXp + '% XP') }

    const bonuses = privateState?.research?.bonuses ?? {}
    let researchXp = Number(bonuses.global_xp ?? 0)
    if (action.skill_key === 'fishing') researchXp += Number(bonuses.xpfishing ?? 0)
    else if (action.skill_key === 'mining') researchXp += Number(bonuses.xpmining ?? 0)
    else if (action.skill_key === 'woodcutting') researchXp += Number(bonuses.xpwoodcutting ?? 0)
    else if (artisanSkills.has(action.skill_key)) researchXp += Number(bonuses.xpartisan ?? 0)
    if (researchXp) { xp += researchXp * 100; notes.push('Institute research: +' + (researchXp * 100).toFixed(3) + '% XP') }

    return { xp, speed, yield: yieldPct, notes }
  }, [action, snapshot, privateState])

  useEffect(() => {
    if (!action || !snapshot) return
    const skill = (snapshot.skills ?? []).find((entry: any) => entry.skill_key === action.skill_key)
    if (skill) {
      setCurrentXp(Number(skill.xp ?? 0))
      setTargetLevel(Math.min(150, Math.max(Number(skill.level ?? 1) + 1, targetLevel)))
    }
  }, [actionKey, snapshot])

  const totalXpPct = liveKnown.xp + manualXpPct
  const totalSpeedPct = liveKnown.speed + manualSpeedPct
  const totalYieldPct = liveKnown.yield + manualYieldPct
  const tree = useMemo(() => action ? buildMaterialTree(action, quantity, catalog) : null, [action, quantity, catalog])
  const raw = useMemo(() => tree ? flattenRawMaterials(tree) : [], [tree])
  const estimate = useMemo(() => action && xpTable.length
    ? actionsForTargetLevel(action, currentXp, targetLevel, xpTable, { xpPct: totalXpPct, speedPct: totalSpeedPct, yieldPct: totalYieldPct, materialSavePct, outputMult })
    : null, [action, xpTable, currentXp, targetLevel, totalXpPct, totalSpeedPct, totalYieldPct, materialSavePct, outputMult])

  return (
    <div className="page">
      <header className="page-header"><div><span className="eyebrow">PERSONALISED PLANNING</span><h1>Skill Planner</h1><p className="muted">Live token data fills the parts we can safely know. Temporary/server effects stay explicit instead of being guessed.</p></div></header>

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
        <div className="panel-title"><div><span className="eyebrow">LIVE-KNOWN BONUSES</span><h2>Your current setup</h2><p className="muted">Equipped skill tool + jewellery + applicable Institute XP are auto-read from your token sync.</p></div></div>
        {liveKnown.notes.length ? liveKnown.notes.map((note) => <div className="list-row" key={note}><strong>{note}</strong></div>) : <p className="empty">Connect and sync your Koruxa token to auto-fill known personal modifiers.</p>}
        <div className="stat-grid mini">
          <div className="mini-stat"><span>Known XP bonus</span><strong>{liveKnown.xp.toFixed(3)}%</strong></div>
          <div className="mini-stat"><span>Known speed bonus</span><strong>{liveKnown.speed.toFixed(2)}%</strong></div>
          <div className="mini-stat"><span>Known yield bonus</span><strong>{liveKnown.yield.toFixed(2)}%</strong></div>
          <div className="mini-stat"><span>Farm level</span><strong>{Number((snapshot?.farms ?? []).find((entry: any) => entry.skill_key === action?.skill_key)?.level ?? 0)}</strong></div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-title"><div><span className="eyebrow">WHAT IF?</span><h2>Level target calculator</h2><p className="muted">Add current server boosts, food/potions, firepit, farm effects or hypothetical changes in the manual fields.</p></div></div>
        <div className="form-grid">
          <label>Current exact XP<input type="number" min={0} value={currentXp} onChange={(e) => setCurrentXp(Number(e.target.value))} /></label>
          <label>Target level<input type="number" min={2} max={150} value={targetLevel} onChange={(e) => setTargetLevel(Number(e.target.value))} /></label>
          <label>Other / temporary XP %<input type="number" value={manualXpPct} onChange={(e) => setManualXpPct(Number(e.target.value))} /></label>
          <label>Other / temporary speed %<input type="number" value={manualSpeedPct} onChange={(e) => setManualSpeedPct(Number(e.target.value))} /></label>
          <label>Other / temporary yield %<input type="number" value={manualYieldPct} onChange={(e) => setManualYieldPct(Number(e.target.value))} /></label>
          <label>Material save %<input type="number" value={materialSavePct} onChange={(e) => setMaterialSavePct(Number(e.target.value))} /></label>
          <label>Output multiplier<input type="number" min={1} step={0.05} value={outputMult} onChange={(e) => setOutputMult(Number(e.target.value))} /></label>
        </div>
        <div className="notice">Effective inputs: {totalXpPct.toFixed(3)}% XP · {totalSpeedPct.toFixed(2)}% speed · {totalYieldPct.toFixed(2)}% yield. The app does not use Koruxa's session-only whatif_tool field as equipped gear.</div>
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
