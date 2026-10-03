import { FormEvent, useEffect, useState } from 'react'
import { getProfiles, invokeKoruxa } from '../lib/data'
import { isSupabaseConfigured } from '../lib/supabase'
import type { Profile } from '../types'

export default function MembersPage({ currentProfile }: { currentProfile: Profile | null }) {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [token, setToken] = useState('')
  const [message, setMessage] = useState('')

  const refresh = () => getProfiles().then(setProfiles).catch((error) => setMessage(error.message))
  useEffect(refresh, [])

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

  return (
    <div className="page">
      <header className="page-header"><div><span className="eyebrow">ROSTER</span><h1>Members</h1></div></header>
      <section className="panel">
        <div className="panel-title"><div><h2>Your Koruxa connection</h2><p className="muted">Your read-only personal token is encrypted server-side and never stored in browser storage.</p></div></div>
        {isSupabaseConfigured ? (
          <form className="inline-form" onSubmit={connect}>
            <input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="kxu_…" required />
            <button className="primary-button" type="submit">{currentProfile?.koruxa_connected ? 'Replace token' : 'Connect token'}</button>
          </form>
        ) : <div className="notice">Demo mode: token connection activates after Supabase setup.</div>}
        {message ? <p className="notice">{message}</p> : null}
      </section>

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
                <td>{profile.discord_user_id ? 'Linked' : 'Not linked'}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
