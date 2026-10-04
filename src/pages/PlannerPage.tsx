import { useEffect, useMemo, useState } from 'react'
import MaterialTree from '../components/MaterialTree'
import ModifierManager, { type ModifierSummary } from '../components/ModifierManager'
import { getSkillActions, getXpTable } from '../lib/data'
import { apiGet, apiPost } from '../lib/api'
import { actionsForTargetLevel, applyMaterialSave, buildMaterialTree, flattenRawMaterials, formatDuration } from '../lib/planner'
import type { Profile, SkillAction } from '../types'

const plannerSkills = [
  'woodcutting',
  'mining',
  'fishing',
  'cooking',
  'smithing',
  'crafting',
  'fletching',
  'jewelery',
  'herblore',
  'arcana',
  'firemaking',
  'alchemy',
  'construction',
  'tinkering',
  'farming',
]

const artisanSkills = new Set(['cooking','smithing','crafting','fletching','herblore','jewelery','firemaking','construction','arcana','alchemy','tinkering'])
const emptyModifierSummary: ModifierSummary = { xpPct: 0, speedPct: 0, yieldPct: 0, materialSavePct: 0, outputMult: 1 }

const patronActiveBonuses: Record<string, { level: number; xp: number; speed: number; mastery: number }> = {
  Apprentice: { level: 1, xp: 20, speed: 20, mastery: 1 },
  Adept: { level: 2, xp: 25, speed: 20, mastery: 2 },
  Initiate: { level: 3, xp: 28, speed: 20, mastery: 3 },
  Veteran: { level: 4, xp: 30, speed: 20, mastery: 4 },
  Champion: { level: 5, xp: 32, speed: 20, mastery: 5 },
  Hero: { level: 6, xp: 34, speed: 20, mastery: 6 },
  Legend: { level: 7, xp: 36, speed: 20, mastery: 7 },
  Mythic: { level: 8, xp: 38, speed: 20, mastery: 8 },
  Ascendant: { level: 9, xp: 40, speed: 20, mastery: 9 },
  Eternal: { level: 10, xp: 42, speed: 20, mastery: 10 },
}

const farmBonuses: Record<number, { speed: number; xp: number; yield: number; mastery: number }> = {
  0: { speed: 0, xp: 0, yield: 0, mastery: 0 },
  1: { speed: 2, xp: 1, yield: 4, mastery: 0 },
  2: { speed: 4, xp: 2, yield: 8, mastery: 0 },
  3: { speed: 6, xp: 4, yield: 12, mastery: 0 },
  4: { speed: 8, xp: 6, yield: 18, mastery: 0 },
  5: { speed: 10, xp: 8, yield: 25, mastery: 0 },
  6: { speed: 12, xp: 10, yield: 32, mastery: 0 },
  7: { speed: 14, xp: 15, yield: 38, mastery: 0 },
  8: { speed: 16, xp: 25, yield: 45, mastery: 1 },
  9: { speed: 16, xp: 30, yield: 48, mastery: 2 },
  10: { speed: 16, xp: 35, yield: 52, mastery: 3 },
}

function compoundedPercent(...percentages: number[]) {
  return (percentages.reduce((multiplier, pct) => multiplier * (1 + Number(pct || 0) / 100), 1) - 1) * 100
}

function skillLabel(skillKey: string) {
  const names: Record<string, string> = {
    woodcutting: 'Woodcutting',
    mining: 'Mining',
    fishing: 'Fishing',
    cooking: 'Cooking',
    smithing: 'Smithing',
    crafting: 'Crafting',
    fletching: 'Fletching',
    jewelery: 'Jewellery',
    herblore: 'Herblore',
    arcana: 'Arcana',
    firemaking: 'Firemaking',
    alchemy: 'Alchemy',
    construction: 'Construction',
    tinkering: 'Tinkering',
    farming: 'Farming',
  }
  return names[skillKey] ?? skillKey.replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function dedupeActions(actions: SkillAction[]) {
  const unique = new Map<string, SkillAction>()
  for (const action of actions) {
    const key = action.skill_key + '|' + action.label.toLowerCase() + '|' + action.reward_item_key
    const current = unique.get(key)
    if (!current || action.action_key.startsWith('wiki_')) unique.set(key, action)
  }
  return [...unique.values()]
}

export default function PlannerPage({ currentProfile }: { currentProfile: Profile | null }) {
  const [catalog, setCatalog] = useState<SkillAction[]>([])
  const [xpTable, setXpTable] = useState<number[]>([])
  const [skillKey, setSkillKey] = useState('cooking')
  const [actionKey, setActionKey] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [currentXp, setCurrentXp] = useState(0)
  const [targetLevel, setTargetLevel] = useState(100)
  const [manualXpPct, setManualXpPct] = useState(0)
  const [manualSpeedPct, setManualSpeedPct] = useState(0)
  const [manualYieldPct, setManualYieldPct] = useState(0)
  const [manualMaterialSavePct, setManualMaterialSavePct] = useState(0)
  const [manualOutputMult, setManualOutputMult] = useState(1)
  const [savedModifiers, setSavedModifiers] = useState<ModifierSummary>(emptyModifierSummary)
  const [snapshot, setSnapshot] = useState<any>(null)
  const [privateState, setPrivateState] = useState<any>(null)
  const [catalogueStatus, setCatalogueStatus] = useState('Loading official Koruxa skill data…')

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const bootstrap: any = await apiPost('/api/planner/bootstrap', {})
        const [actions, table] = await Promise.all([getSkillActions(), getXpTable()])
        if (cancelled) return
        const clean = dedupeActions(actions)
        setCatalog(clean)
        setXpTable(table)
        const failures = Array.isArray(bootstrap?.failures) ? bootstrap.failures : []
        setCatalogueStatus(failures.length
          ? 'Planner loaded. ' + failures.length + ' optional skill source' + (failures.length === 1 ? '' : 's') + ' could not refresh and will retry later.'
          : '')
      } catch (error: any) {
        if (cancelled) return
        // Fall back to whatever is already cached in D1 rather than blocking the planner.
        try {
          const [actions, table] = await Promise.all([getSkillActions(), getXpTable()])
          setCatalog(dedupeActions(actions))
          setXpTable(table)
        } catch {}
        setCatalogueStatus(error.message ?? 'Could not refresh the planner catalogue.')
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!currentProfile) return
    apiGet<{ snapshot: any; private_state: any }>('/api/me/state')
      .then((data) => {
        setSnapshot(data.snapshot)
        setPrivateState(data.private_state)
      })
      .catch(console.error)
  }, [currentProfile?.id])

  const actionsForSkill = useMemo(
    () => catalog
      .filter((entry) => entry.skill_key === skillKey)
      .sort((a, b) => a.min_level - b.min_level || a.label.localeCompare(b.label)),
    [catalog, skillKey],
  )

  useEffect(() => {
    if (!actionsForSkill.length) {
      setActionKey('')
      return
    }
    if (!actionsForSkill.some((entry) => entry.action_key === actionKey)) {
      setActionKey(actionsForSkill[0].action_key)
    }
  }, [skillKey, actionsForSkill, actionKey])

  const action = actionsForSkill.find((entry) => entry.action_key === actionKey)

  const currentFarmLevel = Number((snapshot?.farms ?? []).find((entry: any) => entry.skill_key === action?.skill_key)?.level ?? 0)
  const currentFarmBonus = farmBonuses[Math.max(0, Math.min(10, currentFarmLevel))] ?? farmBonuses[0]

  const liveKnown = useMemo(() => {
    if (!action || !snapshot) return { xp: 0, speed: 0, yield: 0, materialSave: 0, outputMult: 1, notes: [] as string[] }
    const notes: string[] = []
    let xp = 0
    let speed = 0
    let yieldPct = 0
    let materialSave = 0
    let outputMult = 1
    const equipment = snapshot.equipment ?? []

    const tool = equipment.find((item: any) => item.slot === 'tool_' + action.skill_key)
    if (tool) {
      speed += Number(tool.tool_speed ?? 0)
      xp += Number(tool.tool_xp ?? 0)
      yieldPct += Number(tool.tool_yield ?? 0)
      notes.push(String(tool.name) + ': +' + Number(tool.tool_speed ?? 0) + '% speed, +' + Number(tool.tool_xp ?? 0) + '% XP')
    }

    const jewelleryXp = equipment
      .filter((item: any) => item.slot === 'ring' || item.slot === 'neck')
      .reduce((sum: number, item: any) => sum + Number(item.tool_xp ?? 0), 0)
    if (jewelleryXp) {
      xp += jewelleryXp
      notes.push('Equipped jewellery: +' + jewelleryXp + '% XP')
    }

    const matchingCape = equipment.find((item: any) =>
      item.slot === 'cape' && (
        String(item.item_key ?? '').toLowerCase().includes('_' + action.skill_key) ||
        String(item.name ?? '').toLowerCase().startsWith(action.skill_key.toLowerCase())
      )
    )
    if (matchingCape) {
      const capeXp = Number(matchingCape.tool_xp ?? 0)
      const capeSpeed = Number(matchingCape.tool_speed ?? 0)
      const capeYield = Number(matchingCape.tool_yield ?? 0)
      xp += capeXp
      speed += capeSpeed
      yieldPct += capeYield
      notes.push(String(matchingCape.name) + ': +' + capeXp + '% XP' + (capeSpeed ? ', +' + capeSpeed + '% speed' : '') + (capeYield ? ', +' + capeYield + '% yield' : ''))
    }

    const bonuses = privateState?.research?.bonuses ?? {}
    let researchXp = Number(bonuses.global_xp ?? 0)
    if (action.skill_key === 'fishing') researchXp += Number(bonuses.xpfishing ?? 0)
    else if (action.skill_key === 'mining') researchXp += Number(bonuses.xpmining ?? 0)
    else if (action.skill_key === 'woodcutting') researchXp += Number(bonuses.xpwoodcutting ?? 0)
    else if (artisanSkills.has(action.skill_key)) researchXp += Number(bonuses.xpartisan ?? 0)

    if (researchXp) {
      xp += researchXp * 100
      notes.push('Institute XP research: +' + (researchXp * 100).toFixed(3) + '% XP')
    }

    if (action.is_recipe) {
      materialSave += Number(bonuses.ingredient_cost_reduction ?? 0) * 100
      const doubleChance = Number(bonuses.recipe_double_output ?? 0)
      outputMult *= 1 + doubleChance
      if (materialSave) notes.push('Institute Resource Frugality: ' + materialSave.toFixed(3) + '% ingredient save')
      if (doubleChance) notes.push('Institute Bonus Yield: ' + (doubleChance * 100).toFixed(3) + '% double-output chance')
    }

    if (currentFarmLevel > 0) {
      xp += currentFarmBonus.xp
      speed += currentFarmBonus.speed
      yieldPct += currentFarmBonus.yield
      notes.push(
        skillLabel(action.skill_key) + ' Farm Lv' + currentFarmLevel +
        ': +' + currentFarmBonus.xp + '% XP, +' + currentFarmBonus.speed + '% speed, +' +
        currentFarmBonus.yield + '% double-drop chance' +
        (currentFarmBonus.mastery ? ', +' + currentFarmBonus.mastery + '% mastery XP' : '')
      )
    }

    return { xp, speed, yield: yieldPct, materialSave, outputMult, notes }
  }, [action, snapshot, privateState, currentFarmLevel, currentFarmBonus.xp, currentFarmBonus.speed, currentFarmBonus.yield, currentFarmBonus.mastery])

  const patron = snapshot?.is_premium && snapshot?.rank_badge
    ? patronActiveBonuses[String(snapshot.rank_badge)] ?? null
    : null

  useEffect(() => {
    if (!action || !snapshot) return
    const skill = (snapshot.skills ?? []).find((entry: any) => entry.skill_key === action.skill_key)
    if (skill) {
      setCurrentXp(Number(skill.xp ?? 0))
      setTargetLevel(Math.min(150, Math.max(2, Number(skill.level ?? 1) + 1)))
    }
  }, [actionKey, action?.skill_key, snapshot])

  const totalXpPct = compoundedPercent(liveKnown.xp, patron?.xp ?? 0, savedModifiers.xpPct, manualXpPct)
  const totalSpeedPct = compoundedPercent(liveKnown.speed, patron?.speed ?? 0, savedModifiers.speedPct, manualSpeedPct)
  const totalYieldPct = liveKnown.yield + savedModifiers.yieldPct + manualYieldPct
  const totalMaterialSavePct = liveKnown.materialSave + savedModifiers.materialSavePct + manualMaterialSavePct
  const totalOutputMult = liveKnown.outputMult * savedModifiers.outputMult * manualOutputMult

  const quantityTree = useMemo(() => action ? buildMaterialTree(action, quantity, catalog) : null, [action, quantity, catalog])
  const quantityRaw = useMemo(() => quantityTree ? flattenRawMaterials(quantityTree) : [], [quantityTree])

  const estimate = useMemo(() => action && xpTable.length >= 151
    ? actionsForTargetLevel(action, currentXp, targetLevel, xpTable, {
        xpPct: totalXpPct,
        speedPct: totalSpeedPct,
        yieldPct: totalYieldPct,
        materialSavePct: totalMaterialSavePct,
        outputMult: totalOutputMult,
      })
    : null,
  [action, xpTable, currentXp, targetLevel, totalXpPct, totalSpeedPct, totalYieldPct, totalMaterialSavePct, totalOutputMult])

  const targetTree = useMemo(() => action && estimate
    ? buildMaterialTree(action, Math.max(1, estimate.actions * action.amount), catalog)
    : null,
  [action, estimate, catalog])
  const targetRaw = useMemo(() => targetTree ? flattenRawMaterials(targetTree) : [], [targetTree])
  const instituteNodes = (privateState?.research?.nodes ?? []) as any[]

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <span className="eyebrow">PERSONALISED PLANNING</span>
          <h1>Skill Planner</h1>
          <p className="muted">Choose a skill, then an action. Your synced gear, farm, Institute, Patron/Premium state and saved buffs are applied automatically.</p>
        </div>
      </header>

      {catalogueStatus ? <div className="notice">{catalogueStatus}</div> : null}

      <section className="panel">
        <div className="planner-picker-grid">
          <label>Skill
            <select value={skillKey} onChange={(e) => setSkillKey(e.target.value)}>
              {plannerSkills.map((skill) => <option value={skill} key={skill}>{skillLabel(skill)}</option>)}
            </select>
          </label>

          <label>{artisanSkills.has(skillKey) ? 'Craft / action' : 'Action'}
            <select value={actionKey} onChange={(e) => setActionKey(e.target.value)} disabled={!actionsForSkill.length}>
              {actionsForSkill.map((entry) => (
                <option key={entry.action_key} value={entry.action_key}>Lv {entry.min_level} · {entry.label}</option>
              ))}
            </select>
          </label>

          <label>Output quantity
            <input type="number" min={1} value={quantity} onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))} />
          </label>
        </div>
        {!actionsForSkill.length ? <p className="empty">No compatible actions were returned for {skillLabel(skillKey)} yet.</p> : null}
      </section>

      {quantityTree ? <div className="two-column">
        <section className="panel">
          <div className="panel-title"><div><span className="eyebrow">ITEM QUANTITY</span><h2>Stage-by-stage material tree</h2></div></div>
          <MaterialTree root={quantityTree} />
        </section>
        <section className="panel">
          <div className="panel-title"><div><span className="eyebrow">RAW TOTAL</span><h2>Complete raw list</h2></div></div>
          {quantityRaw.length
            ? quantityRaw.map((item) => <div className="list-row" key={item.itemKey}><strong>{item.label}</strong><span>{item.quantity.toLocaleString()}</span></div>)
            : <p className="empty">This action is already a raw gathering action.</p>}
        </section>
      </div> : null}

      <section className="panel">
        <div className="panel-title">
          <div>
            <span className="eyebrow">LIVE-KNOWN SETUP</span>
            <h2>Your current {skillLabel(action?.skill_key ?? skillKey)} setup</h2>
            <p className="muted">Pulled from your synced Koruxa account wherever the public API exposes it.</p>
          </div>
        </div>
        {liveKnown.notes.length
          ? liveKnown.notes.map((note) => <div className="list-row" key={note}><strong>{note}</strong></div>)
          : <p className="empty">Connect and sync your Koruxa token to auto-fill known personal modifiers.</p>}
        {patron
          ? <div className="list-row"><div><strong>Patron Lv{patron.level} · {snapshot.rank_badge}</strong><span>Premium active</span></div><span>+{patron.xp}% XP · +{patron.speed}% speed · +{patron.mastery}% mastery</span></div>
          : snapshot?.rank_badge
            ? <div className="list-row"><div><strong>{snapshot.rank_badge} Patron perks</strong><span>Permanent tier retained</span></div><span className="pill">Premium inactive</span></div>
            : null}
        <div className="stat-grid mini">
          <div className="mini-stat"><span>Known personal XP</span><strong>+{liveKnown.xp.toFixed(3)}%</strong></div>
          <div className="mini-stat"><span>Known personal speed</span><strong>+{liveKnown.speed.toFixed(2)}%</strong></div>
          <div className="mini-stat"><span>Known material save</span><strong>+{liveKnown.materialSave.toFixed(3)}%</strong></div>
          <div className="mini-stat"><span>{skillLabel(action?.skill_key ?? skillKey)} farm</span><strong>Level {currentFarmLevel}</strong></div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-title"><div><span className="eyebrow">INSTITUTE</span><h2>Research levels</h2><p className="muted">Synced directly from your private /me research block.</p></div></div>
        {instituteNodes.length
          ? <div className="research-grid">{instituteNodes.map((node) => (
              <div className="research-card" key={node.key}><div><strong>{node.name}</strong><span>{node.category} · {node.bonus_type}</span></div><strong>Lv {Number(node.level)} / {Number(node.max_level)}{Number(node.prestige ?? 0) ? ' · P' + Number(node.prestige) : ''}</strong></div>
            ))}</div>
          : <p className="empty">Sync your Koruxa token to show Institute node levels.</p>}
      </section>

      <ModifierManager profile={currentProfile} onSummary={setSavedModifiers} />

      <section className="panel">
        <div className="panel-title">
          <div>
            <span className="eyebrow">TARGET LEVEL</span>
            <h2>Level calculator</h2>
            <p className="muted">Current exact XP is filled from your account. Known boosts above are already included.</p>
          </div>
        </div>

        <div className="form-grid">
          <label>Current exact XP<input type="number" min={0} value={currentXp} onChange={(e) => setCurrentXp(Number(e.target.value))} /></label>
          <label>Target level<input type="number" min={2} max={150} value={targetLevel} onChange={(e) => setTargetLevel(Number(e.target.value))} /></label>
        </div>

        <details className="advanced-overrides">
          <summary>Advanced manual overrides</summary>
          <p className="muted">Only use these for a new or unusual effect that the toolkit cannot detect or select above.</p>
          <div className="form-grid">
            <label>Extra XP %<input type="number" step="0.001" value={manualXpPct} onChange={(e) => setManualXpPct(Number(e.target.value))} /></label>
            <label>Extra speed %<input type="number" step="0.001" value={manualSpeedPct} onChange={(e) => setManualSpeedPct(Number(e.target.value))} /></label>
            <label>Extra yield %<input type="number" step="0.001" value={manualYieldPct} onChange={(e) => setManualYieldPct(Number(e.target.value))} /></label>
            <label>Extra material save %<input type="number" step="0.001" value={manualMaterialSavePct} onChange={(e) => setManualMaterialSavePct(Number(e.target.value))} /></label>
            <label>Extra output multiplier<input type="number" min={0.01} step={0.01} value={manualOutputMult} onChange={(e) => setManualOutputMult(Number(e.target.value))} /></label>
          </div>
        </details>

        <div className="notice">Effective inputs: {totalXpPct.toFixed(3)}% XP · {totalSpeedPct.toFixed(3)}% speed · {totalYieldPct.toFixed(3)}% expected extra output · {totalMaterialSavePct.toFixed(3)}% material save.</div>

        {estimate ? <>
          <div className="stat-grid mini">
            <div className="mini-stat"><span>Actions to target</span><strong>{estimate.actions.toLocaleString()}</strong></div>
            <div className="mini-stat"><span>XP / action</span><strong>{estimate.effectiveXpPerAction.toFixed(2)}</strong></div>
            <div className="mini-stat"><span>Estimated time</span><strong>{formatDuration(estimate.expectedSeconds)}</strong></div>
            <div className="mini-stat"><span>Expected output / action</span><strong>{estimate.expectedOutputPerAction.toFixed(3)}</strong></div>
          </div>

          {targetTree && action?.is_recipe ? <div className="target-materials">
            <div className="section-heading"><div><span className="eyebrow">TARGET LEVEL MATERIALS</span><h2>{estimate.actions.toLocaleString()} × {action.label}</h2></div></div>
            <div className="two-column">
              <div><MaterialTree root={targetTree} /></div>
              <div>
                {targetRaw.map((item) => <div className="list-row" key={'target-' + item.itemKey}><div><strong>{item.label}</strong><span>Base {item.quantity.toLocaleString()}</span></div><span>{totalMaterialSavePct > 0 ? 'Expected ≈ ' + applyMaterialSave(item.quantity, totalMaterialSavePct).toLocaleString() : item.quantity.toLocaleString()}</span></div>)}
                {totalMaterialSavePct > 0 ? <p className="muted">Expected material figures apply the selected aggregate material-save percentage to the raw total. Stage-specific mastery saves remain excluded until Koruxa exposes them through a token-safe endpoint.</p> : null}
              </div>
            </div>
          </div> : null}
        </> : <div className="notice">The official Koruxa XP table is loading automatically. No manual Admin import is required.</div>}
      </section>
    </div>
  )
}
