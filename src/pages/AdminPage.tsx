import { FormEvent, useEffect, useState } from 'react'
import { getOrderCategories, getProfiles, invokeKoruxa } from '../lib/data'
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from '../lib/api'
import { isOwner, isOfficer } from '../lib/permissions'
import type { AppRole, OrderCategory, Profile } from '../types'

export default function AdminPage({ currentProfile, onProfileChanged }: { currentProfile: Profile; onProfileChanged: () => void }) {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [watch, setWatch] = useState<any[]>([])
  const [bankItems, setBankItems] = useState<any[]>([])
  const [categories, setCategories] = useState<OrderCategory[]>([])
  const [permissions, setPermissions] = useState<Array<{ profile_id: string; category_id: string }>>([])
  const [permissionMember, setPermissionMember] = useState('')
  const [bankItemName, setBankItemName] = useState('')
  const [minimum, setMinimum] = useState(0)
  const [preferred, setPreferred] = useState(0)
  const [message, setMessage] = useState('')
  const [apiMember, setApiMember] = useState('')
  const [memberApiToken, setMemberApiToken] = useState('')
  const [apiBusy, setApiBusy] = useState(false)
  const [syncBusy, setSyncBusy] = useState<string | null>(null)

  const refresh = async () => {
    const [profileRows, categoryRows, watchRows, clanState] = await Promise.all([
      getProfiles(),
      getOrderCategories(),
      apiGet<{ watch: any[] }>('/api/bank/watch'),
      apiGet<{ state: any }>('/api/clan/state'),
    ])
    setProfiles(profileRows)
    setCategories(categoryRows)
    setWatch(watchRows.watch ?? [])
    setBankItems(
      [...(clanState.state?.bank_json?.items ?? [])]
        .sort((a: any, b: any) => String(a.name ?? '').localeCompare(String(b.name ?? '')))
    )
    const fulfilmentMembers = profileRows.filter((profile) => profile.clan_verified || profile.app_role === 'owner')
    if (!permissionMember && fulfilmentMembers[0]) setPermissionMember(fulfilmentMembers[0].id)
    if (!apiMember && profileRows[0]) setApiMember(profileRows[0].id)

    if (isOfficer(currentProfile.app_role)) {
      const perms = await apiGet<{ permissions: Array<{ profile_id: string; category_id: string }> }>('/api/admin/fulfilment')
      setPermissions(perms.permissions ?? [])
    }
  }

  useEffect(() => { refresh().catch((error) => setMessage(error.message)) }, [currentProfile.app_role])

  const setRole = async (profile: Profile, role: AppRole) => {
    try {
      await apiPatch('/api/admin/users/' + profile.id + '/role', { app_role: role })
      setMessage('Role updated.')
      await refresh()
      if (profile.id === currentProfile.id) await onProfileChanged()
    } catch (error: any) {
      setMessage(error.message)
    }
  }

  const addWatch = async (event: FormEvent) => {
    event.preventDefault()
    try {
      const wanted = bankItemName.trim().toLowerCase()
      const selected = bankItems.find((item: any) =>
        String(item.name ?? '').trim().toLowerCase() === wanted ||
        String(item.item_key ?? '').trim().toLowerCase() === wanted
      )
      if (!selected) {
        setMessage('Choose an item from the synced clan bank list.')
        return
      }

      const result: any = await apiPost('/api/bank/watch', {
        item_key: selected.item_key,
        display_name: selected.name,
        minimum_qty: minimum,
        preferred_qty: preferred || null,
        show_on_home: true,
      })

      setMessage(
        'Tracking ' + result.display_name + ' — current bank quantity ' +
        Number(result.current_quantity ?? 0).toLocaleString() +
        (result.preferred_adjusted ? '. Preferred target was raised to match the minimum.' : '.')
      )
      setBankItemName('')
      setMinimum(0)
      setPreferred(0)
      await refresh()
    } catch (error: any) {
      setMessage(error.message)
    }
  }

  const removeWatch = async (key: string) => {
    try {
      await apiDelete('/api/bank/watch/' + encodeURIComponent(key))
      setMessage('Removed from bank watch.')
      await refresh()
    } catch (error: any) {
      setMessage(error.message)
    }
  }

  const togglePermission = async (categoryId: string, enabled: boolean) => {
    try {
      await apiPut('/api/admin/fulfilment', { user_id: permissionMember, category_id: categoryId, enabled })
      setMessage('Fulfilment permission updated.')
      await refresh()
    } catch (error: any) {
      setMessage(error.message)
    }
  }

  const updateCategoryChannel = async (category: OrderCategory, channelId: string) => {
    try {
      await apiPatch('/api/order-categories/' + category.id, { discord_channel_id: channelId.trim() || null })
      setMessage('Discord channel saved for ' + category.label + '.')
      await refresh()
    } catch (error: any) {
      setMessage(error.message)
    }
  }

  const testCategoryChannel = async (category: OrderCategory) => {
    try {
      const result: any = await apiPost('/api/order-categories/' + category.id + '/test-discord')
      setMessage('Discord test sent for ' + category.label + (result?.message_id ? ' ✓' : '.'))
    } catch (error: any) {
      setMessage(error.message ?? 'Discord test failed.')
    }
  }

  const sync = async (action: 'sync-me' | 'sync-clan' | 'sync-all-members') => {
    try {
      setSyncBusy(action)
      setMessage(action === 'sync-all-members' ? 'Syncing connected members…' : action === 'sync-clan' ? 'Syncing clan and bank…' : 'Syncing your Koruxa profile…')
      const result: any = await invokeKoruxa(action)

      if (action === 'sync-all-members') {
        const failures = Array.isArray(result?.failures) ? result.failures : []
        const synced = Number(result?.synced ?? 0)
        const attempted = Number(result?.attempted ?? synced + failures.length)
        const noSkills = Array.isArray(result?.members) ? result.members.filter((member: any) => Number(member.skill_count ?? 0) === 0) : []

        const detail = [
          synced + ' / ' + attempted + ' members synced.',
          failures.length ? ' Failed: ' + failures.map((entry: any) => (entry.member ?? 'Member') + ' — ' + entry.error).join(' | ') : '',
          noSkills.length ? ' No skill data detected for: ' + noSkills.map((entry: any) => entry.member).join(', ') + '.' : '',
        ].join('')

        setMessage(detail)
      } else if (action === 'sync-clan') {
        setMessage('Clan sync complete. Members: ' + (result?.members ?? '—') + ' · Bank items: ' + (result?.item_count ?? '—') + '.')
      } else {
        setMessage('Your Koruxa profile synced successfully.')
      }

      await onProfileChanged()
      await refresh()
    } catch (error: any) {
      setMessage(error.message ?? 'Sync failed.')
    } finally {
      setSyncBusy(null)
    }
  }

  const saveMemberApi = async () => {
    if (!apiMember || !memberApiToken.trim()) return
    try {
      setApiBusy(true)
      setMessage('Validating and encrypting member API token…')
      const result: any = await apiPost('/api/admin/users/' + apiMember + '/koruxa-token', { token: memberApiToken.trim() })
      setMemberApiToken('')
      setMessage('Connected ' + (result.username ?? 'member') + ' successfully. Their token is encrypted and will not be shown again.')
      await refresh()
    } catch (error: any) {
      setMessage(error.message ?? 'Could not connect member API.')
    } finally {
      setApiBusy(false)
    }
  }

  const syncSelectedMemberApi = async () => {
    if (!apiMember) return
    try {
      setApiBusy(true)
      const selected = profiles.find((profile) => profile.id === apiMember)
      setMessage('Syncing ' + (selected?.koruxa_name ?? selected?.display_name ?? 'member') + '…')
      const result: any = await apiPost('/api/admin/users/' + apiMember + '/sync-koruxa')
      setMessage(
        'Synced ' + (result.member ?? 'member') + '. ' +
        Number(result.skill_count ?? 0) + ' skills detected' +
        (Number(result.skill_count ?? 0) === 0 ? ' — the Koruxa response contained no readable skill block.' : '.')
      )
      await refresh()
    } catch (error: any) {
      setMessage(error.message ?? 'Could not sync member API.')
    } finally {
      setApiBusy(false)
    }
  }

  const removeMemberApi = async () => {
    if (!apiMember) return
    const selected = profiles.find((profile) => profile.id === apiMember)
    const name = selected?.koruxa_name ?? selected?.display_name ?? 'this member'
    if (!window.confirm('Remove the saved Koruxa API token for ' + name + '? Historical snapshots will be kept.')) return

    try {
      setApiBusy(true)
      await apiDelete('/api/admin/users/' + apiMember + '/koruxa-token')
      setMemberApiToken('')
      setMessage('Removed the saved Koruxa API token for ' + name + '.')
      await refresh()
    } catch (error: any) {
      setMessage(error.message ?? 'Could not remove member API.')
    } finally {
      setApiBusy(false)
    }
  }

  const selectedPermissions = new Set(permissions.filter((row) => row.profile_id === permissionMember).map((row) => row.category_id))

  if (!isOfficer(currentProfile.app_role)) {
    return <div className="page"><div className="notice">This area is for Owners and Officers. Your normal clan tools are available from the navigation.</div></div>
  }

  return (
    <div className="page">
      <header className="page-header"><div><span className="eyebrow">ACCESS & CONFIGURATION</span><h1>Admin</h1><p className="muted">The first Discord account to sign in is bootstrapped as Owner. Owners can promote the clan owner to a second Owner.</p></div></header>
      {message ? <div className="notice">{message}</div> : null}

      {isOwner(currentProfile.app_role) ? <section className="panel">
        <div className="panel-title"><div><h2>App roles</h2><p className="muted">Koruxa rank never grants app admin access automatically. Multiple Owners are supported, and the final Owner cannot be demoted.</p></div></div>
        <div className="table-wrap"><table><thead><tr><th>Member</th><th>Discord</th><th>Role</th><th>Set role</th></tr></thead><tbody>
          {profiles.map((profile) => <tr key={profile.id}>
            <td>{profile.koruxa_name ?? profile.display_name ?? profile.id}</td>
            <td>{profile.discord_global_name ?? profile.discord_username ?? profile.discord_user_id}</td>
            <td><span className="pill">{profile.access_role === 'outsider' || (!profile.clan_verified && profile.app_role !== 'owner') ? 'Outsider' : profile.app_role}</span></td>
            <td>{profile.access_role === 'outsider' || (!profile.clan_verified && profile.app_role !== 'owner')
              ? <span className="muted">Verify as StrawHats member before promotion</span>
              : <select value={profile.app_role} onChange={(e) => setRole(profile, e.target.value as AppRole)}><option value="member">Member</option><option value="officer">Officer</option><option value="owner">Owner</option></select>}</td>
          </tr>)}
        </tbody></table></div>
      </section> : null}

      {isOwner(currentProfile.app_role) ? <section className="panel member-api-admin">
        <div className="panel-title">
          <div>
            <span className="eyebrow">OWNER ONLY</span>
            <h2>Member API connections</h2>
            <p className="muted">If a member has sent you their personal read-only Koruxa API token, you can connect it for them here. The token is validated against the StrawHats roster, encrypted server-side, and never displayed again.</p>
          </div>
        </div>

        <div className="member-api-form">
          <label>Member app account
            <select value={apiMember} onChange={(e) => { setApiMember(e.target.value); setMemberApiToken('') }}>
              {profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {(profile.koruxa_name ?? profile.display_name ?? profile.discord_global_name ?? profile.discord_username ?? profile.id) +
                    (profile.koruxa_connected ? ' · API connected' : ' · not connected')}
                </option>
              ))}
            </select>
          </label>

          <label>Koruxa personal API token
            <input
              type="password"
              value={memberApiToken}
              onChange={(e) => setMemberApiToken(e.target.value)}
              placeholder="kxu_…"
              autoComplete="off"
            />
          </label>

          <div className="member-api-actions">
            <button className="primary-button" type="button" disabled={!apiMember || !memberApiToken.trim() || apiBusy} onClick={saveMemberApi}>
              {apiBusy ? 'Working…' : profiles.find((profile) => profile.id === apiMember)?.koruxa_connected ? 'Replace API token' : 'Add API token'}
            </button>
            {profiles.find((profile) => profile.id === apiMember)?.koruxa_connected
              ? <>
                  <button className="secondary-button" type="button" disabled={apiBusy} onClick={syncSelectedMemberApi}>Sync this member</button>
                  <button className="ghost-button" type="button" disabled={apiBusy} onClick={removeMemberApi}>Remove saved token</button>
                </>
              : null}
          </div>
        </div>

        <div className="member-api-status-grid">
          {profiles.map((profile) => (
            <div className="member-api-status-card" key={'api-' + profile.id}>
              <div>
                <strong>{profile.koruxa_name ?? profile.display_name ?? profile.discord_global_name ?? profile.discord_username ?? 'App account'}</strong>
                <span>{profile.discord_global_name ?? profile.discord_username ?? 'Discord linked'}</span>
              </div>
              <span className={profile.koruxa_connected ? 'pill success' : 'pill'}>{profile.koruxa_connected ? 'API connected' : 'Needs API'}</span>
            </div>
          ))}
        </div>

        <p className="muted">Members who have not signed into HAKI Toolkit yet do not have an app account to attach a token to. They only need to sign in with Discord once; after that you can add their API here.</p>
      </section> : null}

      <section className="panel">
        <div className="panel-title"><div><h2>Koruxa sync</h2><p className="muted">Clan sync uses the server-side clan token. Member sync uses each member's encrypted personal token.</p></div></div>
        <div className="button-row">
          <button className="primary-button" disabled={Boolean(syncBusy)} onClick={() => sync('sync-me')}>{syncBusy === 'sync-me' ? 'Syncing…' : 'Sync me'}</button>
          <button className="secondary-button" disabled={Boolean(syncBusy)} onClick={() => sync('sync-clan')}>{syncBusy === 'sync-clan' ? 'Syncing…' : 'Sync clan + bank'}</button>
          <button className="secondary-button" disabled={Boolean(syncBusy)} onClick={() => sync('sync-all-members')}>{syncBusy === 'sync-all-members' ? 'Syncing members…' : 'Sync connected members'}</button>
        </div>
      </section>

      <section className="panel">
        <div className="panel-title">
          <div>
            <span className="eyebrow">SHOP STAFFING</span>
            <h2>Shop owners / suppliers</h2>
            <p className="muted">Assign the members allowed to fulfil each shop. Assigned members are listed publicly on that order board and can mark themselves Busy without disabling new orders.</p>
          </div>
        </div>
        <label>Member<select value={permissionMember} onChange={(e) => setPermissionMember(e.target.value)}>{profiles.filter((profile) => profile.clan_verified || profile.app_role === 'owner').map((profile) => <option key={profile.id} value={profile.id}>{profile.koruxa_name ?? profile.display_name ?? profile.id}</option>)}</select></label>
        <div className="permission-grid">{categories.map((category) => {
          const checked = selectedPermissions.has(category.id)
          const assigned = permissions
            .filter((permission) => permission.category_id === category.id)
            .map((permission) => profiles.find((profile) => profile.id === permission.profile_id))
            .filter(Boolean)
          return <label className="check-card shop-owner-admin-card" key={category.id}>
            <input type="checkbox" checked={checked} onChange={(e) => togglePermission(category.id, e.target.checked)} />
            <span>
              <strong>{category.label}</strong>
              <small>{category.description}</small>
              <small className="shop-owner-admin-list">
                {assigned.length
                  ? 'Shop owners: ' + assigned.map((profile: any) => profile.koruxa_name ?? profile.display_name ?? 'Member').join(', ')
                  : 'No shop owners assigned yet'}
              </small>
            </span>
          </label>
        })}</div>
      </section>

      <section className="panel">
        <div className="panel-title"><div><h2>Order Discord channels</h2><p className="muted">Each order tab can post to its own Discord channel. Enter the numeric channel ID. The HAKI Toolkit bot needs View Channel, Send Messages and Embed Links for the fancy order cards.</p></div></div>
        {categories.map((category) => <CategoryChannel key={category.id} category={category} onSave={updateCategoryChannel} onTest={testCategoryChannel} />)}
      </section>

      <section className="panel">
        <div className="panel-title"><div><h2>Bank watch list</h2><p className="muted">Only explicitly tracked items can trigger low-stock cards.</p></div></div>
        <form className="form-grid" onSubmit={addWatch}>
          <label>Clan bank item
            <input
              list="bank-watch-items"
              value={bankItemName}
              onChange={(e) => setBankItemName(e.target.value)}
              placeholder="Start typing, e.g. Moonwood Log"
              required
            />
            <datalist id="bank-watch-items">
              {bankItems.map((item: any) => (
                <option key={String(item.item_key)} value={String(item.name)}>{Number(item.quantity ?? 0).toLocaleString()} in bank</option>
              ))}
            </datalist>
          </label>
          <label>Minimum<input type="number" min={0} value={minimum} onChange={(e) => setMinimum(Number(e.target.value))} /></label>
          <label>Preferred<input type="number" min={0} value={preferred} onChange={(e) => setPreferred(Number(e.target.value))} /></label>
          <button className="primary-button">Save tracked item</button>
        </form>
        <p className="muted">Choose the actual synced bank item rather than typing an internal item key. Preferred should normally be the comfortable stock target and should be at least the minimum.</p>
        {watch.map((item) => <div className="list-row" key={item.item_key}>
          <div>
            <strong>{item.display_name}</strong>
            <span>
              Current {Number(item.quantity ?? 0).toLocaleString()} · min {Number(item.minimum_qty).toLocaleString()}
              {item.preferred_qty ? ' · preferred ' + Number(item.preferred_qty).toLocaleString() : ''}
              {!item.matched ? ' · ⚠ not matched to current bank data' : ''}
            </span>
          </div>
          <button className="ghost-button" onClick={() => removeWatch(item.item_key)}>Remove</button>
        </div>)}
      </section>


    </div>
  )
}

function CategoryChannel({ category, onSave, onTest }: { category: OrderCategory; onSave: (category: OrderCategory, channelId: string) => void; onTest: (category: OrderCategory) => void }) {
  const [value, setValue] = useState(category.discord_channel_id ?? '')
  useEffect(() => setValue(category.discord_channel_id ?? ''), [category.discord_channel_id])
  return <div className="list-row"><div><strong>{category.label}</strong><span>{category.description}</span></div><div className="compact-editor"><input value={value} onChange={(e) => setValue(e.target.value)} placeholder="Numeric Discord Channel ID" /><button className="secondary-button" onClick={() => onSave(category, value)}>Save</button><button className="ghost-button" disabled={!category.discord_channel_id} onClick={() => onTest(category)}>Test</button></div></div>
}
