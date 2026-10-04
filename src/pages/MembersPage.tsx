import { FormEvent, useEffect, useMemo, useState } from 'react'
import { invokeKoruxa } from '../lib/data'
import { apiGet, apiPut } from '../lib/api'
import type { Profile } from '../types'

type ClanMember = {
  character_id: number
  character: string
  rank: string
  rank_name: string
  joined_at: string
  xp_contributed: number
  xp_this_week: number
  xp_last_week: number
}

type MemberDetail = {
  member: ClanMember
  profile?: Profile
}

function timezoneOptions() {
  const fallback = [
    'Europe/London',
    'Europe/Dublin',
    'Europe/Paris',
    'Europe/Berlin',
    'Europe/Warsaw',
    'Europe/Athens',
    'America/New_York',
    'America/Chicago',
    'America/Denver',
    'America/Los_Angeles',
    'America/Toronto',
    'America/Vancouver',
    'America/Sao_Paulo',
    'Australia/Perth',
    'Australia/Adelaide',
    'Australia/Brisbane',
    'Australia/Sydney',
    'Pacific/Auckland',
    'Asia/Tokyo',
    'Asia/Seoul',
    'Asia/Singapore',
    'Asia/Kolkata',
  ]
  try {
    const supported = (Intl as any).supportedValuesOf?.('timeZone')
    return Array.isArray(supported) && supported.length ? supported : fallback
  } catch {
    return fallback
  }
}

function localTime(timezone?: string | null, now = Date.now()) {
  if (!timezone) return null
  try {
    const date = new Date(now)
    const time = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(date)
    const day = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      weekday: 'short',
    }).format(date)
    const hour = Number(new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hour: '2-digit',
      hourCycle: 'h23',
    }).format(date))
    const period =
      hour < 5 ? 'Late night' :
      hour < 8 ? 'Early morning' :
      hour < 12 ? 'Morning' :
      hour < 17 ? 'Afternoon' :
      hour < 22 ? 'Evening' :
      'Night'
    const icon = hour < 6 || hour >= 22 ? '🌙' : hour < 18 ? '☀️' : '🌆'
    return { time, day, hour, period, icon }
  } catch {
    return null
  }
}

function timezoneShortLabel(timezone?: string | null) {
  if (!timezone) return 'Not set'
  return timezone.replace(/_/g, ' ').replace('/', ' · ')
}

export default function MembersPage({ currentProfile, onProfileChanged }: { currentProfile: Profile; onProfileChanged: () => void }) {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [clanMembers, setClanMembers] = useState<ClanMember[]>([])
  const [token, setToken] = useState('')
  const [message, setMessage] = useState('')
  const [timezone, setTimezone] = useState('')
  const [selectedMember, setSelectedMember] = useState<MemberDetail | null>(null)
  const [clockNow, setClockNow] = useState(Date.now())

  const allTimezones = useMemo(() => timezoneOptions(), [])

  const refresh = async () => {
    const data = await apiGet<{ profiles: Profile[]; clan_members: ClanMember[] }>('/api/members')
    setProfiles(data.profiles ?? [])
    setClanMembers(data.clan_members ?? [])
    const me = (data.profiles ?? []).find((profile) => profile.id === currentProfile.id)
    setTimezone(me?.timezone ?? '')
    setSelectedMember((current) => {
      if (!current) return current
      const profile = (data.profiles ?? []).find((entry) => Number(entry.koruxa_character_id) === Number(current.member.character_id))
      return { ...current, profile }
    })
  }

  useEffect(() => { refresh().catch((error) => setMessage(error.message)) }, [])

  useEffect(() => {
    const timer = window.setInterval(() => setClockNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  const profileByCharacter = useMemo(() => {
    const map = new Map<number, Profile>()
    for (const profile of profiles) {
      if (profile.koruxa_character_id != null) map.set(Number(profile.koruxa_character_id), profile)
    }
    return map
  }, [profiles])

  const connectedCount = useMemo(
    () => clanMembers.filter((member) => profileByCharacter.get(Number(member.character_id))?.koruxa_connected).length,
    [clanMembers, profileByCharacter],
  )

  const connect = async (event: FormEvent) => {
    event.preventDefault()
    try {
      setMessage('Validating token with Koruxa…')
      const result: any = await invokeKoruxa('connect', { token })
      setToken('')
      setMessage('Connected as ' + (result?.username ?? 'Koruxa character') + '.')
      await onProfileChanged()
      await refresh()
    } catch (error: any) {
      setMessage(error.message ?? 'Could not connect token.')
    }
  }

  const syncMe = async () => {
    try {
      setMessage('Syncing your Koruxa data…')
      await invokeKoruxa('sync-me')
      setMessage('Koruxa profile synced.')
      await onProfileChanged()
      await refresh()
    } catch (error: any) {
      setMessage(error.message ?? 'Sync failed.')
    }
  }

  const saveTimezone = async (value = timezone) => {
    try {
      const zone = value.trim()
      const result: any = await apiPut('/api/members/timezone', { timezone: zone || null })
      setTimezone(result.timezone ?? '')
      setMessage(result.timezone ? 'Timezone saved as ' + timezoneShortLabel(result.timezone) + '.' : 'Timezone removed.')
      await refresh()
    } catch (error: any) {
      setMessage(error.message ?? 'Could not save timezone.')
    }
  }

  const useDeviceTimezone = async () => {
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (!detected) {
      setMessage('Your browser did not expose a timezone.')
      return
    }
    setTimezone(detected)
    await saveTimezone(detected)
  }

  const displayRows = clanMembers.length ? clanMembers : profiles.map((profile) => ({
    character_id: Number(profile.koruxa_character_id ?? 0),
    character: profile.koruxa_name ?? profile.display_name ?? 'Unlinked member',
    rank: '',
    rank_name: '',
    joined_at: '',
    xp_contributed: 0,
    xp_this_week: 0,
    xp_last_week: 0,
  }))

  const myTime = localTime(timezone, clockNow)
  const selectedTime = localTime(selectedMember?.profile?.timezone, clockNow)

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <span className="eyebrow">ROSTER</span>
          <h1>Members</h1>
          <p className="muted">{clanMembers.length ? connectedCount + ' / ' + clanMembers.length + ' clan members have connected their Koruxa token.' : 'Run the first clan sync to load the StrawHats roster.'}</p>
        </div>
      </header>

      <div className="two-column">
        <section className="panel">
          <div className="panel-title"><div><h2>Your Koruxa connection</h2><p className="muted">Your read-only personal token is encrypted server-side and never stored in browser storage.</p></div></div>
          <form className="stack" onSubmit={connect}>
            <input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="kxu_…" required />
            <div className="button-row">
              <button className="primary-button" type="submit">{currentProfile.koruxa_connected ? 'Replace token' : 'Connect token'}</button>
              {currentProfile.koruxa_connected ? <button className="secondary-button" type="button" onClick={syncMe}>Sync now</button> : null}
            </div>
          </form>
        </section>

        <section className="panel">
          <div className="panel-title"><div><h2>Discord identity</h2><p className="muted">Discord login links this automatically, so order-ready notifications already know who to tag.</p></div></div>
          <div className="list-row"><div><strong>{currentProfile.discord_global_name ?? currentProfile.discord_username ?? currentProfile.display_name}</strong><span>Discord ID {currentProfile.discord_user_id}</span></div><span className="pill success">Linked</span></div>
          <div className="list-row"><div><strong>App role</strong><span>Separate from your Koruxa clan rank</span></div><span className="pill">{currentProfile.app_role}</span></div>
        </section>
      </div>

      <section className="panel timezone-panel">
        <div className="panel-title">
          <div>
            <span className="eyebrow">YOUR LOCAL TIME</span>
            <h2>Timezone</h2>
            <p className="muted">Set this once and clan members will see your current local time on your member card. It only stores the timezone, not your location.</p>
          </div>
          {myTime ? <div className="member-clock large"><span>{myTime.icon} {myTime.period}</span><strong>{myTime.time}</strong><small>{myTime.day} · {timezoneShortLabel(timezone)}</small></div> : null}
        </div>
        <div className="timezone-editor">
          <label>Timezone
            <input list="member-timezones" value={timezone} onChange={(e) => setTimezone(e.target.value)} placeholder="e.g. Europe/London" />
            <datalist id="member-timezones">
              {allTimezones.map((zone) => <option key={zone} value={zone}>{timezoneShortLabel(zone)}</option>)}
            </datalist>
          </label>
          <button className="secondary-button" type="button" onClick={useDeviceTimezone}>Use my device timezone</button>
          <button className="primary-button" type="button" onClick={() => saveTimezone()}>Save timezone</button>
          {timezone ? <button className="ghost-button" type="button" onClick={() => saveTimezone('')}>Remove</button> : null}
        </div>
      </section>

      {message ? <p className="notice">{message}</p> : null}

      <section className="panel">
        <div className="panel-title"><div><h2>Clan roster</h2><p className="muted">Open a member to see their current local time and account details.</p></div></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Member</th><th>Koruxa rank</th><th>App role</th><th>Local time</th><th>API</th><th>This week</th><th>Total clan XP</th><th></th></tr></thead>
            <tbody>{displayRows.map((member) => {
              const profile = profileByCharacter.get(Number(member.character_id))
              const time = localTime(profile?.timezone, clockNow)
              return (
                <tr key={member.character_id || member.character}>
                  <td><strong>{member.character}</strong></td>
                  <td>{member.rank_name || '—'}</td>
                  <td>{profile ? <span className="pill">{profile.app_role}</span> : <span className="pill">No app account</span>}</td>
                  <td>
                    {time
                      ? <div className="roster-local-time"><strong>{time.time}</strong><span>{time.icon} {time.period}</span></div>
                      : <span className="muted">Not set</span>}
                  </td>
                  <td>{profile?.koruxa_connected ? <span className="pill success">Connected</span> : <span className="pill">Not connected</span>}</td>
                  <td>{Number(member.xp_this_week ?? 0).toLocaleString()}</td>
                  <td>{Number(member.xp_contributed ?? 0).toLocaleString()}</td>
                  <td><button className="ghost-button" type="button" onClick={() => setSelectedMember({ member, profile })}>View</button></td>
                </tr>
              )
            })}</tbody>
          </table>
        </div>
      </section>

      {selectedMember ? <div className="member-modal-backdrop" onClick={() => setSelectedMember(null)}>
        <section className="member-info-card" onClick={(event) => event.stopPropagation()}>
          <div className="member-info-head">
            <div>
              <span className="eyebrow">MEMBER INFO</span>
              <h2>{selectedMember.member.character}</h2>
              <p className="muted">{selectedMember.member.rank_name || 'StrawHats member'}{selectedMember.profile ? ' · ' + selectedMember.profile.app_role : ''}</p>
            </div>
            <button className="ghost-button member-modal-close" type="button" onClick={() => setSelectedMember(null)}>✕</button>
          </div>

          <div className="member-time-card">
            {selectedTime ? <>
              <span>{selectedTime.icon} {selectedTime.period} for them</span>
              <strong>{selectedTime.time}</strong>
              <small>{selectedTime.day} · {timezoneShortLabel(selectedMember.profile?.timezone)}</small>
            </> : <>
              <span>🕒 Local time</span>
              <strong>Not set</strong>
              <small>This member has not added a timezone yet.</small>
            </>}
          </div>

          <div className="member-info-grid">
            <div><span>Koruxa rank</span><strong>{selectedMember.member.rank_name || '—'}</strong></div>
            <div><span>App role</span><strong>{selectedMember.profile?.app_role ?? 'No app account'}</strong></div>
            <div><span>This week</span><strong>{Number(selectedMember.member.xp_this_week ?? 0).toLocaleString()} XP</strong></div>
            <div><span>Total clan XP</span><strong>{Number(selectedMember.member.xp_contributed ?? 0).toLocaleString()} XP</strong></div>
            <div><span>API</span><strong>{selectedMember.profile?.koruxa_connected ? 'Connected' : 'Not connected'}</strong></div>
            <div><span>Timezone</span><strong>{timezoneShortLabel(selectedMember.profile?.timezone)}</strong></div>
          </div>

          {selectedMember.profile?.id === currentProfile.id ? <div className="member-self-timezone">
            <strong>This is you</strong>
            <span className="muted">Use the Timezone panel above to update the local time shown here.</span>
          </div> : null}
        </section>
      </div> : null}
    </div>
  )
}
