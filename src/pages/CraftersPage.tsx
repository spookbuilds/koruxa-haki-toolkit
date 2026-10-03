import { useEffect, useMemo, useState } from 'react'
import { getSkillActions } from '../lib/data'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import type { SkillAction } from '../types'

export default function CraftersPage() {
  const [catalog, setCatalog] = useState<SkillAction[]>([])
  const [snapshots, setSnapshots] = useState<any[]>([])
  const [query, setQuery] = useState('')

  useEffect(() => {
    getSkillActions().then(setCatalog)
    if (isSupabaseConfigured && supabase) {
      supabase.from('latest_member_snapshots').select('*').then(({ data }) => setSnapshots(data ?? []))
    }
  }, [])

  const actions = useMemo(() => catalog
    .filter((action) => action.is_recipe && (!query || action.reward_label.toLowerCase().includes(query.toLowerCase())))
    .slice(0, 60), [catalog, query])

  const capable = (action: SkillAction) => snapshots
    .map((snapshot) => {
      const skill = (snapshot.skills ?? []).find((entry: any) => entry.skill_key === action.skill_key)
      return { name: snapshot.koruxa_name, level: Number(skill?.level ?? 0) }
    })
    .filter((member) => member.level >= action.min_level)
    .sort((a, b) => b.level - a.level)

  return (
    <div className="page">
      <header className="page-header"><div><span className="eyebrow">CAPABILITY FINDER</span><h1>Who Can Make This?</h1></div></header>
      <section className="panel">
        <input className="search-input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search an item…" />
        <div className="catalog-list">
          {actions.map((action) => {
            const members = capable(action)
            return <div className="catalog-row" key={action.action_key}>
              <div><strong>{action.reward_label}</strong><span>{action.skill_key} · Level {action.min_level}</span></div>
              <div className="crafter-list">{members.length ? members.slice(0, 8).map((member) => <span className="pill success" key={member.name}>{member.name} · {member.level}</span>) : <span className="pill">{snapshots.length ? 'Nobody synced can make this yet' : 'Sync members to compare'}</span>}</div>
            </div>
          })}
        </div>
      </section>
    </div>
  )
}
