import { ChangeEvent, FormEvent, useEffect, useState } from 'react'
import { getProfiles, invokeKoruxa } from '../lib/data'
import { sanitizeSkillExport } from '../lib/catalog'
import { isOwner, isOfficer } from '../lib/permissions'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import type { AppRole, Profile } from '../types'

export default function AdminPage({ currentProfile, onProfileChanged }: { currentProfile: Profile | null; onProfileChanged: () => void }) {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [watch, setWatch] = useState<any[]>([])
  const [itemKey, setItemKey] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [minimum, setMinimum] = useState(0)
  const [preferred, setPreferred] = useState(0)
  const [message, setMessage] = useState('')

  const refresh = async () => {
    setProfiles(await getProfiles())
    if (supabase) {
      const { data } = await supabase.from('bank_watch_items').select('*').order('display_name')
      setWatch(data ?? [])
    }
  }
  useEffect(() => { refresh().catch(console.error) }, [])

  if (!isSupabaseConfigured) return <div className="page"><div className="notice">Admin writes are disabled in demo mode. The full controls activate after Supabase setup.</div></div>
  if (!currentProfile) return null

  const claimInitialOwner = async () => {
    if (!supabase) return
    const { data, error } = await supabase.rpc('claim_initial_owner')
    setMessage(error ? error.message : data ? 'You are now an Owner.' : 'An Owner already exists.')
    onProfileChanged()
  }

  const setRole = async (profile: Profile, role: AppRole) => {
    if (!supabase) return
    const { error } = await supabase.rpc('set_member_role', { target_profile: profile.id, new_role: role })
    setMessage(error ? error.message : 'Role updated.')
    await refresh()
  }

  const addWatch = async (event: FormEvent) => {
    event.preventDefault()
    if (!supabase) return
    const { error } = await supabase.from('bank_watch_items').upsert({
      item_key: itemKey.trim(),
      display_name: displayName.trim() || itemKey.trim(),
      minimum_qty: minimum,
      preferred_qty: preferred || null,
      show_on_home: true,
      updated_by: currentProfile.id,
    })
    setMessage(error ? error.message : 'Bank watch item saved.')
    if (!error) { setItemKey(''); setDisplayName(''); setMinimum(0); setPreferred(0); await refresh() }
  }

  const importCatalog = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    if (!files.length || !supabase) return
    try {
      let total = 0
      let latestXpTable: number[] = []
      for (const file of files) {
        const parsed = JSON.parse(await file.text())
        const sanitized = sanitizeSkillExport(parsed)
        if (sanitized.actions.length) {
          const { error } = await supabase.from('skill_actions').upsert(sanitized.actions, { onConflict: 'action_key' })
          if (error) throw error
          total += sanitized.actions.length
        }
        if (sanitized.xpTable.length) latestXpTable = sanitized.xpTable
      }
      if (latestXpTable.length) {
        const { error } = await supabase.from('app_settings').upsert({ key: 'xp_table', value: latestXpTable, updated_by: currentProfile.id })
        if (error) throw error
      }
      setMessage('Imported ' + total + ' static Koruxa actions. Personal calc/inventory fields were not stored.')
    } catch (error: any) {
      setMessage(error.message ?? 'Import failed.')
    } finally {
      event.target.value = ''
    }
  }

  const sync = async (action: 'sync-me' | 'sync-clan' | 'sync-all-members') => {
    try {
      setMessage('Syncing…')
      const result = await invokeKoruxa(action)
      setMessage('Sync complete: ' + JSON.stringify(result))
    } catch (error: any) {
      setMessage(error.message ?? 'Sync failed.')
    }
  }

  return (
    <div className="page">
      <header className="page-header"><div><span className="eyebrow">ACCESS & CONFIGURATION</span><h1>Admin</h1></div></header>
      {message ? <div className="notice">{message}</div> : null}

      {!isOwner(currentProfile.app_role) ? (
        <section className="panel">
          <h2>Owner setup</h2>
          <p className="muted">If this is the first account in a fresh install, claim the initial Owner role. After that, only an Owner can promote another Owner.</p>
          <button className="primary-button" onClick={claimInitialOwner}>Claim initial Owner</button>
        </section>
      ) : null}

      {isOwner(currentProfile.app_role) ? <section className="panel">
        <div className="panel-title"><div><h2>App roles</h2><p className="muted">Koruxa rank never grants app admin access automatically. You and the clan owner can both be Owner.</p></div></div>
        <div className="table-wrap"><table><thead><tr><th>Member</th><th>Role</th><th>Set role</th></tr></thead><tbody>
          {profiles.map((profile) => <tr key={profile.id}><td>{profile.koruxa_name ?? profile.display_name ?? profile.id}</td><td><span className="pill">{profile.app_role}</span></td><td><select value={profile.app_role} onChange={(e) => setRole(profile, e.target.value as AppRole)}><option value="member">Member</option><option value="officer">Officer</option><option value="owner">Owner</option></select></td></tr>)}
        </tbody></table></div>
      </section> : null}

      {isOfficer(currentProfile.app_role) ? <>
        <section className="panel">
          <div className="panel-title"><div><h2>Koruxa sync</h2><p className="muted">Clan sync uses the server-side clan token. Member sync uses each member's encrypted personal token.</p></div></div>
          <div className="button-row"><button className="primary-button" onClick={() => sync('sync-me')}>Sync me</button><button className="secondary-button" onClick={() => sync('sync-clan')}>Sync clan + bank</button><button className="secondary-button" onClick={() => sync('sync-all-members')}>Sync connected members</button></div>
        </section>

        <section className="panel">
          <div className="panel-title"><div><h2>Bank watch list</h2><p className="muted">Only explicitly tracked items can trigger low-stock cards.</p></div></div>
          <form className="form-grid" onSubmit={addWatch}>
            <label>Item key<input value={itemKey} onChange={(e) => setItemKey(e.target.value)} placeholder="noctite_ore" required /></label>
            <label>Display name<input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Noctite Ore" /></label>
            <label>Minimum<input type="number" min={0} value={minimum} onChange={(e) => setMinimum(Number(e.target.value))} /></label>
            <label>Preferred<input type="number" min={0} value={preferred} onChange={(e) => setPreferred(Number(e.target.value))} /></label>
            <button className="primary-button">Save tracked item</button>
          </form>
          {watch.map((item) => <div className="list-row" key={item.item_key}><div><strong>{item.display_name}</strong><span>{item.item_key}</span></div><span>min {Number(item.minimum_qty).toLocaleString()}</span></div>)}
        </section>
      </> : null}

      {isOwner(currentProfile.app_role) ? <section className="panel">
        <div className="panel-title"><div><h2>Static game catalogue</h2><p className="muted">Upload one or more DevTools skill JSON exports. The importer strips personalised calc, bank and inventory fields and stores only reusable action/recipe data.</p></div></div>
        <input type="file" accept=".json,.txt" multiple onChange={importCatalog} />
      </section> : null}
    </div>
  )
}
