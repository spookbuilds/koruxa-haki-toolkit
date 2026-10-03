import { useEffect, useMemo, useState } from 'react'
import { getSkillActions } from '../lib/data'
import { apiGet } from '../lib/api'
import type { SkillAction } from '../types'

type Candidate = { name: string; level: number; gap: number; tool: string | null }

export default function CraftersPage() {
  const [catalog, setCatalog] = useState<SkillAction[]>([])
  const [snapshots, setSnapshots] = useState<any[]>([])
  const [query, setQuery] = useState('')

  useEffect(() => {
    Promise.all([
      getSkillActions(),
      apiGet<{ snapshots: any[] }>('/api/snapshots/latest'),
    ]).then(([actions, data]) => {
      setCatalog(actions)
      setSnapshots(data.snapshots ?? [])
    }).catch(console.error)
  }, [])

  const actions = useMemo(() => catalog
    .filter((action) => action.is_recipe && (!query || action.reward_label.toLowerCase().includes(query.toLowerCase())))
    .slice(0, 100), [catalog, query])

  const candidates = (action: SkillAction): Candidate[] => snapshots
    .map((snapshot) => {
      const skill = (snapshot.skills ?? []).find((entry: any) => entry.skill_key === action.skill_key)
      const level = Number(skill?.level ?? 0)
      const equippedTool = (snapshot.equipment ?? []).find((entry: any) => entry.slot === 'tool_' + action.skill_key)
      return {
        name: snapshot.koruxa_name ?? snapshot.display_name ?? 'Clan member',
        level,
        gap: Math.max(0, action.min_level - level),
        tool: equippedTool?.name ? String(equippedTool.name) : null,
      }
    })
    .sort((a, b) => b.level - a.level || a.name.localeCompare(b.name))

  return (
    <div className="page">
      <header className="page-header">
        <div><span className="eyebrow">CAPABILITY FINDER</span><h1>Who Can Make This?</h1><p className="muted">Search a crafted item to see synced clan members who meet the skill level, plus their relevant equipped tool.</p></div>
      </header>
      <section className="panel">
        <input className="search-input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search an item…" />
        <div className="catalog-list">
          {actions.map((action) => {
            const all = candidates(action)
            const capable = all.filter((member) => member.level >= action.min_level)
            const shown = capable.length ? capable.slice(0, 8) : all.slice(0, 3)
            return <div className="catalog-row" key={action.action_key}>
              <div><strong>{action.reward_label}</strong><span>{action.skill_key} · Level {action.min_level}{action.unlock_reqs?.length ? ' · extra unlock requirements' : ''}</span></div>
              <div className="crafter-list">
                {shown.length ? shown.map((member) => (
                  <span className={'crafter-chip ' + (member.gap === 0 ? 'capable' : 'near')} key={member.name}>
                    <strong>{member.name} · Lv {member.level}</strong>
                    <small>{member.gap === 0 ? (member.tool ?? 'No relevant tool synced') : member.gap + ' levels short'}</small>
                  </span>
                )) : <span className="pill">No connected member snapshots yet</span>}
              </div>
            </div>
          })}
          {!actions.length ? <p className="empty">No matching recipe found in the imported catalogue.</p> : null}
        </div>
      </section>
      <div className="notice">“Can make” currently confirms the skill-level requirement. Recipes with quest/mastery/coin unlocks are labelled so members know to verify those extra unlocks until Koruxa exposes per-character action unlock state through the token-safe API.</div>
    </div>
  )
}
