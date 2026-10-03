import { FormEvent, useEffect, useState } from 'react'
import { getProfiles, invokeKoruxa } from '../lib/data'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import type { Profile } from '../types'

export default function MembersPage({ currentProfile }: { currentProfile: Profile | null }) {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [token, setToken] = useState('')
  const [discordId, setDiscordId] = useState(currentProfile?.discord_user_id ?? '')
  const [message, setMessage] = useState('')

  const refresh = () => getProfiles().then(setProfiles).catch((error) => setMessage(error.message))
  useEffect(() => { refresh() }, [])
  useEffect(() => { setDiscordId(currentProfile?.discord_user_id ?? '') }, [currentProfile?.discord_user_id])

  const connect = async (event: FormEvent) => {
    event.preventDefault()
    try {
      setMessage('Validating token with Koruxa…')
      const result = await invokeKoruxa('connect', { token })
      setToken('')
      setMessage('Connected as ' + (result?.username ?? 'Koruxa character') + '.')
      refresh()
    } catch (error: any) {
      setMessage(error.message ?? 'Could not connect token.')
    }
  }

  const saveDiscord = async () => {
    if (!supabase || !currentProfile) return
    const cleaned = discordId.trim()
    if (cleaned && !/^\d{15,22}$/.test(cleaned)) {
      setMessage('Discord user ID should be the numeric ID, not the username.')
      return
    }
    const { error } = await supabase.from('profiles').update({ discord_user_id: cleaned || null }).eq('id', currentProfile.id)
    setMessage(error ? error.message : 'Discord ID saved. Ready-order messages can now tag you.')
    refresh()
  }

  const syncMe = async () => {
    try {
      setMessage('Syncing your Koruxa data…')
      await invokeKoruxa('sync-me')
      setMessage('Koruxa profile synced.')
      refresh()
    } catch (error: any) {
      setMessage(error.message ?? 'Sync failed.')
    }
  }

  return (
    <div className="page">
      <header className="page-header"><div><span className="eyebrow">ROSTER</span><h1>Members</h1></div></header>
      <div className="two-column">
        <section className="panel">
          <div className="panel-title"><div><h2>Your Koruxa connection</h2><p className="muted">Your read-only personal token is encrypted server-side and never stored in browser storage.</p></div></div>
          {isSupabaseConfigured ? (
            <form className="stack" onSubmit={connect}>
              <input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="kxu_…" required />
              <div className="button-row"><button className="primary-button" type="submit">{currentProfile?.koruxa_connected ? 'Replace token' : 'Connect token'}</button>{currentProfile?.koruxa_connected ? <button className="secondary-button" type="button" onClick={syncMe}>Sync now</button> : null}</div>
            </form>
          ) : <div className="notice">Demo mode: token connection activates after Supabase setup.</div>}
        </section>

        <section className="panel">
          <div className="panel-title"><div><h2>Discord notifications</h2><p className="muted">Save your numeric Discord user ID so the bot can tag you when an order is ready.</p></div></div>
          <div className="inline-form"><input value={discordId} onChange={(e) => setDiscordId(e.target.value)} placeholder="Discord user ID" /><button className="primary-button" type="button" onClick={saveDiscord}>Save</button></div>
        </section>
      </div>
      {message ? <p className="notice">{message}</p> : null}

      <section className="panel">
        <div className="panel-title"><div><h2>Clan roster</h2><p className="muted">App role is deliberately separate from Koruxa clan rank.</p></div></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Member</th><th>App role</th><th>Koruxa API</th><th>Discord</th></tr></thead>
            <tbody>{profiles.map((profile) => (
              <tr key={profile.id}>
                <td><strong>{profile.koruxa_name ?? profile.display_name ?? 'Unlinked member'}</strong></td>
                <td><span className="pill">{profile.app_role}</span></td>
                <td>{profile.koruxa_connected ? <span className="pill success">Connected</span> : <span className="pill">Not connected</span>}</td>
                <td>{profile.discord_user_id ? <span className="pill success">Linked</span> : <span className="pill">Not linked</span>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
