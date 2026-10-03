import { useEffect, useMemo, useState } from 'react'
import { isSupabaseConfigured, supabase } from '../lib/supabase'

type Row = { skill_key: string; profile_id: string; koruxa_name: string; level: number; xp: number; rank: number }

export default function LeaderboardsPage() {
  const [rows, setRows] = useState<Row[]>([])

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return
    supabase.from('skill_leaderboard').select('*').lte('rank', 3).order('skill_key').order('rank').then(({ data }) => setRows((data ?? []) as Row[]))
  }, [])

  const groups = useMemo(() => rows.reduce<Record<string, Row[]>>((acc, row) => {
    ;(acc[row.skill_key] ??= []).push(row)
    return acc
  }, {}), [rows])

  return (
    <div className="page">
      <header className="page-header"><div><span className="eyebrow">TOP 3</span><h1>Skill Leaderboards</h1><p className="muted">Ranked by level first, exact XP second.</p></div></header>
      {!rows.length ? <div className="notice">Leaderboards populate automatically after connected members have synced at least once.</div> : null}
      <section className="leaderboard-grid">
        {Object.entries(groups).map(([skill, leaders]) => (
          <article className="panel compact" key={skill}>
            <h2 className="capitalize">{skill}</h2>
            {leaders.map((row) => (
              <div className="podium-row" key={row.profile_id}>
                <span className="rank-badge">{['🥇', '🥈', '🥉'][row.rank - 1]}</span>
                <div><strong>{row.koruxa_name}</strong><span>Level {row.level} · {row.xp.toLocaleString()} XP</span></div>
              </div>
            ))}
          </article>
        ))}
      </section>
    </div>
  )
}
