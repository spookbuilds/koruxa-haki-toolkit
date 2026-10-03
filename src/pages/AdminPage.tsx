import { ChangeEvent, FormEvent, useEffect, useState } from 'react'
import { getOrderCategories, getProfiles, invokeKoruxa } from '../lib/data'
import { sanitizeSkillExport } from '../lib/catalog'
import { isOwner, isOfficer } from '../lib/permissions'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import type { AppRole, OrderCategory, Profile } from '../types'

export default function AdminPage({ currentProfile, onProfileChanged }: { currentProfile: Profile | null; onProfileChanged: () => void }) {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [watch, setWatch] = useState<any[]>([])
  const [categories, setCategories] = useState<OrderCategory[]>([])
  const [permissions, setPermissions] = useState<Array<{ profile_id: string; category_id: string }>>([])
  const [permissionMember, setPermissionMember] = useState('')
  const [itemKey, setItemKey] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [minimum, setMinimum] = useState(0)
  const [preferred, setPreferred] = useState(0)
  const [message, setMessage] = useState('')

  const refresh = async () => {
    const [profileRows, categoryRows] = await Promise.all([getProfiles(), getOrderCategories()])
    setProfiles(profileRows)
    setCategories(categoryRows)
    if (!permissionMember && profileRows[0]) setPermissionMember(profileRows[0].id)
    if (supabase) {
      const [{ data: watchRows }, { data: permRows }] = await Promise.all([
        supabase.from('bank_watch_items').select('*').order('display_name'),
        supabase.from('fulfilment_permissions').select('profile_id,category_id'),
      ])
      setWatch(watchRows ?? [])
      setPermissions(permRows ?? [])
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

  const removeWatch = async (key: string) => {
    if (!supabase) return
    const { error } = await supabase.from('bank_watch_items').delete().eq('item_key', key)
    setMessage(error ? error.message : 'Removed from bank watch.')
    await refresh()
  }

  const togglePermission = async (categoryId: string, enabled: boolean) => {
    if (!supabase || !permissionMember) return
    const result = enabled
      ? await supabase.from('fulfilment_permissions').upsert({ profile_id: permissionMember, category_id: categoryId, granted_by: currentProfile.id })
      : await supabase.from('fulfilment_permissions').delete().eq('profile_id', permissionMember).eq('category_id', categoryId)
    setMessage(result.error ? result.error.message : 'Fulfilment permission updated.')
    await refresh()
  }

  const updateCategoryChannel = async (category: OrderCategory, channelId: string) => {
    if (!supabase) return
    const { error } = await supabase.from('order_categories').update({ discord_channel_id: channelId.trim() || null }).eq('id', category.id)
    setMessage(error ? error.message : 'Discord channel saved for ' + category.label + '.')
    await refresh()
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

  const selectedPermissions = new Set(permissions.filter((row) => row.profile_id === permissionMember).map((row) => row.category_id))

  return (
    <div className="page">
      <header className="page-header"><div><span className="eyebrow">ACCESS & CONFIGURATION</span><h1>Admin</h1></div></header>
      {message ? <div className="notice">{message}</div> : null}

      {!isOfficer(currentProfile.app_role) ? (
        <section className="panel">
          <h2>Owner setup / restricted area</h2>
          <p className="muted">On a brand-new install, the first intended owner can claim the initial Owner role. Once an Owner exists, this action will refuse everyone else.</p>
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
          <div className="panel-title"><div><h2>Order fulfilment permissions</h2><p className="muted">These are separate from app rank. Use them for cases such as only Spook fulfilling Fish orders.</p></div></div>
          <label>Member<select value={permissionMember} onChange={(e) => setPermissionMember(e.target.value)}>{profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.koruxa_name ?? profile.display_name ?? profile.id}</option>)}</select></label>
          <div className="permission-grid">{categories.map((category) => {
            const checked = selectedPermissions.has(category.id)
            return <label className="check-card" key={category.id}><input type="checkbox" checked={checked} onChange={(e) => togglePermission(category.id, e.target.checked)} /><span><strong>{category.label}</strong><small>{category.description}</small></span></label>
          })}</div>
        </section>

        <section className="panel">
          <div className="panel-title"><div><h2>Order Discord channels</h2><p className="muted">Every order tab can post to its own Discord channel. Enter the numeric channel ID.</p></div></div>
          {categories.map((category) => <CategoryChannel key={category.id} category={category} onSave={updateCategoryChannel} />)}
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
          {watch.map((item) => <div className="list-row" key={item.item_key}><div><strong>{item.display_name}</strong><span>{item.item_key} · min {Number(item.minimum_qty).toLocaleString()}</span></div><button className="ghost-button" onClick={() => removeWatch(item.item_key)}>Remove</button></div>)}
        </section>
      </> : null}

      {isOwner(currentProfile.app_role) ? <section className="panel">
        <div className="panel-title"><div><h2>Static game catalogue</h2><p className="muted">Upload one or more DevTools skill JSON exports. The importer strips personalised calc, bank and inventory fields and stores only reusable action/recipe data.</p></div></div>
        <input type="file" accept=".json,.txt" multiple onChange={importCatalog} />
      </section> : null}
    </div>
  )
}

function CategoryChannel({ category, onSave }: { category: OrderCategory; onSave: (category: OrderCategory, channelId: string) => void }) {
  const [value, setValue] = useState(category.discord_channel_id ?? '')
  useEffect(() => setValue(category.discord_channel_id ?? ''), [category.discord_channel_id])
  return <div className="list-row"><div><strong>{category.label}</strong><span>{category.description}</span></div><div className="compact-editor"><input value={value} onChange={(e) => setValue(e.target.value)} placeholder="Discord channel ID" /><button className="secondary-button" onClick={() => onSave(category, value)}>Save</button></div></div>
}
