import { FormEvent, useEffect, useMemo, useState } from 'react'
import { invokeKoruxa } from '../lib/data'
import { apiGet } from '../lib/api'
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

export default function MembersPage({ currentProfile, onProfileChanged }: { currentProfile: Profile; onProfileChanged: () => void }) {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [clanMembers, setClanMembers] = useState<ClanMember[]>([])
  const [token, setToken] = useState('')
  const [message, setMessage] = useState('')

  const refresh = async () => {
    const data = await apiGet<{ profiles: Profile[]; clan_members: ClanMember[] }>('/api/members')
    setProfiles(data.profiles ?? [])
    setClanMembers(data.clan_members ?? [])
  }

  useEffect(() => { refresh().catch((error) => setMessage(error.message)) }, [])

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

      {message ? <p className="notice">{message}</p> : null}

      <section className="panel">
        <div className="panel-title"><div><h2>Clan roster</h2><p className="muted">Koruxa rank is shown for context. App role and admin access are assigned separately.</p></div></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Member</th><th>Koruxa rank</th><th>App role</th><th>API</th><th>This week</th><th>Total clan XP</th><th>Discord</th></tr></thead>
            <tbody>{displayRows.map((member) => {
              const profile = profileByCharacter.get(Number(member.character_id))
              return (
                <tr key={member.character_id || member.character}>
                  <td><strong>{member.character}</strong></td>
                  <td>{member.rank_name || '—'}</td>
                  <td>{profile ? <span className="pill">{profile.app_role}</span> : <span className="pill">No app account</span>}</td>
                  <td>{profile?.koruxa_connected ? <span className="pill success">Connected</span> : <span className="pill">Not connected</span>}</td>
                  <td>{Number(member.xp_this_week ?? 0).toLocaleString()}</td>
                  <td>{Number(member.xp_contributed ?? 0).toLocaleString()}</td>
                  <td>{profile?.discord_user_id ? <span className="pill success">Linked</span> : <span className="pill">Not linked</span>}</td>
                </tr>
              )
            })}</tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
