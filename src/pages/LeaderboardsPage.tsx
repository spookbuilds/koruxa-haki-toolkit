import { useEffect, useMemo, useState } from 'react'
import { apiGet, apiPost, apiPut } from '../lib/api'
import { isOfficer } from '../lib/permissions'
import type { Profile } from '../types'

type Row = { skill_key: string; profile_id: string; koruxa_name: string; level: number; xp: number; rank: number }
type GainRow = { skill_key: string; profile_id: string; koruxa_name: string; xp_gain: number; level_now: number }

export default function LeaderboardsPage({ currentProfile }: { currentProfile: Profile }) {
  const [rows, setRows] = useState<Row[]>([])
  const [gains, setGains] = useState<GainRow[]>([])
  const [days, setDays] = useState(7)
  const [discordChannel, setDiscordChannel] = useState('')
  const [discordMessageId, setDiscordMessageId] = useState('')
  const [discordBusy, setDiscordBusy] = useState(false)
  const [discordStatus, setDiscordStatus] = useState('')

  useEffect(() => {
    apiGet<{ current: Row[]; gains: GainRow[] }>('/api/leaderboards?days=' + days)
      .then((data) => { setRows(data.current ?? []); setGains(data.gains ?? []) })
      .catch(console.error)
  }, [days])


  useEffect(() => {
    if (!isOfficer(currentProfile.app_role)) return
    apiGet<{ config: { channel_id?: string; message_id?: string } }>('/api/admin/leaderboard-discord')
      .then((data) => {
        setDiscordChannel(data.config?.channel_id ?? '')
        setDiscordMessageId(data.config?.message_id ?? '')
      })
      .catch((error) => setDiscordStatus(error.message ?? 'Could not load Discord leaderboard settings.'))
  }, [currentProfile.app_role])

  const saveDiscordChannel = async () => {
    try {
      setDiscordBusy(true)
      setDiscordStatus('')
      const result: any = await apiPut('/api/admin/leaderboard-discord', { channel_id: discordChannel.trim() })
      setDiscordMessageId(result?.config?.message_id ?? '')
      setDiscordStatus(discordChannel.trim() ? 'Discord channel saved.' : 'Discord leaderboard publishing disabled.')
    } catch (error: any) {
      setDiscordStatus(error.message ?? 'Could not save Discord channel.')
    } finally {
      setDiscordBusy(false)
    }
  }

  const publishDiscordLeaderboard = async () => {
    try {
      setDiscordBusy(true)
      setDiscordStatus('')
      const result: any = await apiPost('/api/admin/leaderboard-discord/publish')
      setDiscordMessageId(result?.message_id ?? discordMessageId)
      setDiscordStatus(
        result?.edited
          ? 'Discord leaderboard refreshed in place ✓'
          : 'Discord leaderboard published ✓ Future member syncs will update this same message automatically.'
      )
    } catch (error: any) {
      setDiscordStatus(error.message ?? 'Could not publish Discord leaderboard.')
    } finally {
      setDiscordBusy(false)
    }
  }

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

      {isOfficer(currentProfile.app_role) ? <section className="panel leaderboard-discord-panel">
        <div className="panel-title">
          <div>
            <span className="eyebrow">DISCORD SKILL DIRECTORY</span>
            <h2>Live Top 3 leaderboard</h2>
            <p className="muted">Publish this leaderboard to one Discord channel. The bot keeps a single message updated instead of posting a new one each time levels change.</p>
          </div>
        </div>

        <div className="leaderboard-discord-controls">
          <label>Discord channel ID
            <input
              value={discordChannel}
              onChange={(e) => setDiscordChannel(e.target.value)}
              placeholder="Numeric Discord Channel ID"
            />
          </label>
          <div className="button-row">
            <button type="button" className="secondary-button" disabled={discordBusy} onClick={saveDiscordChannel}>
              {discordBusy ? 'Working…' : 'Save channel'}
            </button>
            <button type="button" className="primary-button" disabled={discordBusy || !discordChannel.trim()} onClick={publishDiscordLeaderboard}>
              {discordBusy ? 'Working…' : discordMessageId ? 'Refresh Discord now' : 'Publish to Discord'}
            </button>
          </div>
        </div>

        <p className="muted leaderboard-discord-note">
          {discordMessageId
            ? 'Connected ✓ It refreshes automatically whenever connected member skill data syncs.'
            : 'Publish once to create the message. The bot needs View Channel, Send Messages and Embed Links in that channel.'}
        </p>
        {discordStatus ? <div className="notice">{discordStatus}</div> : null}
      </section> : null}

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
              {entries.sort((a, b) => b.xp_gain - a.xp_gain).slice(0, 3).map((row, index) => (
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
