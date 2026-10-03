import { useEffect, useMemo, useState } from 'react'
import { isSupabaseConfigured, supabase } from '../lib/supabase'

type Row = { skill_key: string; profile_id: string; koruxa_name: string; level: number; xp: number; rank: number }
type GainRow = { skill_key: string; profile_id: string; koruxa_name: string; xp_gain: number; level_now: number }

export default function LeaderboardsPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [gains, setGains] = useState<GainRow[]>([])
  const [days, setDays] = useState(7)

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return
    supabase.from('skill_leaderboard').select('*').lte('rank', 3).order('skill_key').order('rank').then(({ data }) => setRows((data ?? []) as Row[]))
  }, [])

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return
    const since = new Date(Date.now() - days * 86400000).toISOString()
    supabase.rpc('skill_xp_gains', { since_at: since }).then(({ data }) => setGains((data ?? []) as GainRow[]))
  }, [days])

  const groups = useMemo(() => rows.reduce<Record<string, Row[]>>((acc, row) => {
    ;(acc[row.skill_key] ??= []).push(row)
    return acc
  }, {}), [rows])

  const gainGroups = useMemo(() => gains.reduce<Record<string, GainRow[]>>((acc, row) => {
    if (row.xp_gain <= 0) return acc
    ;(acc[row.skill_key] ??= []).push(row)
    return acc
  }, {}), [gains])

  return (
    <div className="page">
      <header className="page-header"><div><span className="eyebrow">CLAN PROGRESS</span><h1>Leaderboards</h1><p className="muted">Top 3 by exact XP, plus gains calculated from the snapshots our app saves over time.</p></div></header>

      <section>
        <div className="section-heading"><div><span className="eyebrow">CURRENT</span><h2>Top 3 per skill</h2></div></div>
        {!rows.length ? <div className="notice">Leaderboards populate automatically after connected members have synced at least once.</div> : null}
        <div className="leaderboard-grid">
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
        </div>
      </section>

      <section>
        <div className="section-heading">
          <div><span className="eyebrow">MOMENTUM</span><h2>XP gains</h2></div>
          <select className="small-select" value={days} onChange={(e) => setDays(Number(e.target.value))}>
            <option value={1}>Last 24 hours</option>
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
          </select>
        </div>
        {!gains.length ? <div className="notice">Gain leaderboards need at least two snapshots inside the selected period.</div> : null}
        <div className="leaderboard-grid">
          {Object.entries(gainGroups).map(([skill, entries]) => (
            <article className="panel compact" key={'gain-' + skill}>
              <h2 className="capitalize">{skill}</h2>
              {entries.slice(0, 3).map((row, index) => (
                <div className="podium-row" key={row.profile_id}>
                  <span className="rank-badge">{['🥇', '🥈', '🥉'][index]}</span>
                  <div><strong>{row.koruxa_name}</strong><span>+{Number(row.xp_gain).toLocaleString()} XP · Level {row.level_now}</span></div>
                </div>
              ))}
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
