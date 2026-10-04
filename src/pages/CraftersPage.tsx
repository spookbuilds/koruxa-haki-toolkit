import { useEffect, useMemo, useState } from 'react'
import { getSkillActions } from '../lib/data'
import { apiGet } from '../lib/api'
import type { SkillAction } from '../types'

type Candidate = {
  name: string
  level: number | null
  gap: number | null
  tool: string | null
  syncedAt?: string | null
}

function normaliseSkillKey(value: unknown) {
  const key = String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  const aliases: Record<string, string> = {
    jewellery: 'jewelery',
    runecrafting: 'arcana',
    rune_crafting: 'arcana',
    runecraft: 'arcana',
    arcane: 'arcana',
  }
  return aliases[key] ?? key
}

function findSkill(skills: any[], wanted: string) {
  const target = normaliseSkillKey(wanted)
  return (Array.isArray(skills) ? skills : []).find((entry: any) =>
    normaliseSkillKey(entry?.skill_key ?? entry?.skill ?? entry?.key ?? entry?.name) === target
  )
}

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
    .filter((action) =>
      action.is_recipe &&
      action.skill_key !== 'alchemy' &&
      (!query || action.reward_label.toLowerCase().includes(query.toLowerCase()))
    )
    .slice(0, 100), [catalog, query])

  const candidates = (action: SkillAction): Candidate[] => snapshots
    .map((snapshot) => {
      const skill = findSkill(snapshot.skills ?? [], action.skill_key)
      const rawLevel = skill ? Number(skill.level ?? skill.skill_level ?? skill.lvl ?? 0) : null
      const level = rawLevel != null && Number.isFinite(rawLevel) && rawLevel >= 0 && rawLevel <= 150 ? rawLevel : null
      const equippedTool = (snapshot.equipment ?? []).find((entry: any) =>
        normaliseSkillKey(String(entry.slot ?? '').replace(/^tool_/, '')) === normaliseSkillKey(action.skill_key)
      )
      return {
        name: snapshot.koruxa_name ?? snapshot.display_name ?? 'Clan member',
        level,
        gap: level == null ? null : Math.max(0, action.min_level - level),
        tool: equippedTool?.name ? String(equippedTool.name) : null,
        syncedAt: snapshot.captured_at ?? null,
      }
    })
    .sort((a, b) => (b.level ?? -1) - (a.level ?? -1) || a.name.localeCompare(b.name))

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <span className="eyebrow">CAPABILITY FINDER</span>
          <h1>Who Can Make This?</h1>
          <p className="muted">Search a crafted item to see synced clan members who meet the skill level, plus their relevant equipped tool. Alchemy transmutation is excluded because clan members do not request it from one another.</p>
        </div>
      </header>

      <section className="panel">
        <input className="search-input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search an item…" />
        <div className="catalog-list">
          {actions.map((action) => {
            const all = candidates(action)
            const capable = all.filter((member) => member.level != null && member.level >= action.min_level)
            const withData = all.filter((member) => member.level != null)
            const shown = capable.length ? capable.slice(0, 8) : withData.length ? withData.slice(0, 3) : all.slice(0, 3)

            return <div className="catalog-row" key={action.action_key}>
              <div>
                <strong>{action.reward_label}</strong>
                <span>{action.skill_key} · Level {action.min_level}{action.unlock_reqs?.length ? ' · extra unlock requirements' : ''}</span>
              </div>
              <div className="crafter-list">
                {shown.length ? shown.map((member) => {
                  const hasData = member.level != null
                  const canMake = hasData && Number(member.level) >= action.min_level
                  return (
                    <span className={'crafter-chip ' + (canMake ? 'capable' : hasData ? 'near' : 'unknown')} key={member.name}>
                      <strong>{member.name} · {hasData ? 'Lv ' + member.level : 'skill data unavailable'}</strong>
                      <small>
                        {!hasData
                          ? 'Sync this member again'
                          : canMake
                            ? (member.tool ?? 'No relevant tool synced')
                            : member.gap + ' levels short'}
                      </small>
                    </span>
                  )
                }) : <span className="pill">No connected member snapshots yet</span>}
              </div>
            </div>
          })}
          {!actions.length ? <p className="empty">No matching recipe found in the catalogue.</p> : null}
        </div>
      </section>

    </div>
  )
}
