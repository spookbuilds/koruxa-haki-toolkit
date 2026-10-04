import { useEffect, useMemo, useState } from 'react'
import FishOrderForm from '../components/FishOrderForm'
import OreGemOrderForm from '../components/OreGemOrderForm'
import CatalogueOrderForm from '../components/CatalogueOrderForm'
import PotionOrderForm from '../components/PotionOrderForm'
import CombatOrderForm from '../components/CombatOrderForm'
import { getOrderCategories, getOrders, invokeKoruxa } from '../lib/data'
import { apiGet, apiPost, apiPut } from '../lib/api'
import type { ClanOrder, OrderCategory, Profile } from '../types'

type QueueView = 'mine' | 'claimable' | 'working' | 'ready' | 'active' | 'history'

type ShopSupplier = {
  profile_id: string
  category_id: string
  name: string
  status: 'available' | 'busy'
  updated_at?: string | null
  is_self?: boolean
}

function categoryDisplayLabel(category: OrderCategory) {
  if (category.id === 'ore-gems') return 'Mining · Ore & Uncut Gems'
  if (category.id === 'jewelery') return 'Jewellery · Cut Gems'
  return category.label
}

function orderLines(order: ClanOrder) {
  const lines = Array.isArray(order.payload?.lines) ? order.payload.lines as any[] : []
  return lines
}

function orderTotal(order: ClanOrder) {
  return Number(order.payload?.total_gp ?? 0)
}

function orderNotes(order: ClanOrder) {
  return String(order.payload?.notes ?? '').trim()
}

const cookedFishLabels = [
  'Cooked Mudfish',
  'Cooked Silverscale',
  'Cooked Riverfin',
  'Cooked Crimson Carp',
  'Cooked Goldstream',
  'Cooked Thunderfin',
  'Cooked Stoneback',
  'Cooked Ironjaw',
  'Cooked Frostgill',
  'Cooked Shadowfin',
  'Cooked Abyssal Eel',
  'Cooked Emberfin',
  'Cooked Tidecrusher',
  'Cooked Voidtooth',
  'Cooked Leviathan',
  'Cooked Lavafin',
  'Cooked Magmajaw',
  'Cooked Pyrescale',
  'Burnt Fish',
]

export default function OrdersPage({ currentProfile, onProfileChanged }: { currentProfile: Profile; onProfileChanged?: () => Promise<void> | void }) {
  const outsider = currentProfile.access_role === 'outsider' || (!currentProfile.clan_verified && currentProfile.app_role !== 'owner')
  const [orders, setOrders] = useState<ClanOrder[]>([])
  const [categories, setCategories] = useState<OrderCategory[]>([])
  const [suppliers, setSuppliers] = useState<ShopSupplier[]>([])
  const [activeCategory, setActiveCategory] = useState('')
  const [queueView, setQueueView] = useState<QueueView>('mine')
  const [message, setMessage] = useState('')
  const [verificationToken, setVerificationToken] = useState('')
  const [verifying, setVerifying] = useState(false)

  const refresh = async () => {
    const [orderRows, categoryRows, supplierRows] = await Promise.all([
      getOrders(),
      getOrderCategories(),
      apiGet<{ suppliers: ShopSupplier[] }>('/api/order-suppliers'),
    ])
    setOrders(orderRows)
    setCategories(categoryRows)
    setSuppliers(supplierRows.suppliers ?? [])
    if (!activeCategory && categoryRows[0]) setActiveCategory(categoryRows[0].id)
  }

  useEffect(() => { refresh().catch((error) => setMessage(error.message)) }, [])

  const mySupplierCategories = useMemo(
    () => new Set(suppliers.filter((supplier) => supplier.profile_id === currentProfile.id).map((supplier) => supplier.category_id)),
    [suppliers, currentProfile.id],
  )

  const counts = useMemo(() => ({
    mine: orders.filter((order) => order.requester_profile_id === currentProfile.id && !['collected', 'cancelled'].includes(order.status)).length,
    claimable: orders.filter((order) => order.status === 'open' && order.requester_profile_id !== currentProfile.id && mySupplierCategories.has(order.category_id)).length,
    working: orders.filter((order) => ['claimed', 'in_progress'].includes(order.status)).length,
    ready: orders.filter((order) => order.status === 'ready').length,
    active: orders.filter((order) => !['collected', 'cancelled'].includes(order.status)).length,
    history: orders.filter((order) => ['collected', 'cancelled'].includes(order.status)).length,
  }), [orders, currentProfile.id, mySupplierCategories])

  const visible = useMemo(() => orders.filter((order) => {
    if (queueView === 'mine') return order.requester_profile_id === currentProfile.id && !['collected', 'cancelled'].includes(order.status)
    if (queueView === 'claimable') return order.status === 'open' && order.requester_profile_id !== currentProfile.id && mySupplierCategories.has(order.category_id)
    if (queueView === 'working') return ['claimed', 'in_progress'].includes(order.status)
    if (queueView === 'ready') return order.status === 'ready'
    if (queueView === 'history') return ['collected', 'cancelled'].includes(order.status)
    return !['collected', 'cancelled'].includes(order.status)
  }), [orders, queueView, currentProfile.id, mySupplierCategories])

  const insertOrder = async (orderSummary: string, payload: Record<string, unknown>) => {
    try {
      const result: any = await apiPost('/api/orders', { category_id: activeCategory, summary: orderSummary, payload })
      setMessage(result?.discord_warning
        ? 'Order created. Discord warning: ' + result.discord_warning
        : 'Order created and posted to Discord.')
      setQueueView('mine')
      await refresh()
    } catch (error: any) {
      setMessage(error.message ?? 'Could not create order.')
    }
  }

  const transition = async (order: ClanOrder, action: 'claim' | 'ready' | 'collected' | 'cancel') => {
    try {
      await apiPost('/api/orders/' + order.id + '/' + action)
      setMessage(
        action === 'claim' ? 'Order claimed — it is now in Currently Working On.' :
        action === 'ready' ? 'Order marked ready and the requester has been notified.' :
        action === 'collected' ? 'Order completed and moved to history.' :
        order.status === 'open' ? 'Order deleted from the active queue.' : 'Order cancelled and moved to history.'
      )
      await refresh()
    } catch (error: any) {
      setMessage(error.message ?? 'Order update failed.')
    }
  }

  const activeCategoryInfo = categories.find((category) => category.id === activeCategory)
  const activeSuppliers = suppliers.filter((supplier) => supplier.category_id === activeCategory)
  const availableSuppliers = activeSuppliers.filter((supplier) => supplier.status === 'available')
  const busySuppliers = activeSuppliers.filter((supplier) => supplier.status === 'busy')
  const mySupplier = activeSuppliers.find((supplier) => supplier.profile_id === currentProfile.id)

  const toggleMySupplierStatus = async () => {
    if (!mySupplier || !activeCategory) return
    const nextStatus = mySupplier.status === 'busy' ? 'available' : 'busy'
    try {
      await apiPut('/api/order-suppliers/' + activeCategory + '/status', { status: nextStatus })
      setMessage(nextStatus === 'busy'
        ? 'You are now marked Busy for ' + (activeCategoryInfo?.label ?? 'this shop') + '. Orders can still be placed.'
        : 'You reopened ' + (activeCategoryInfo?.label ?? 'this shop') + ' and are marked Available.')
      await refresh()
    } catch (error: any) {
      setMessage(error.message ?? 'Could not update supplier availability.')
    }
  }

  const verifyClanMembership = async () => {
    if (!verificationToken.trim()) return
    try {
      setVerifying(true)
      setMessage('Checking your Koruxa character against the StrawHats roster…')
      const result: any = await invokeKoruxa('connect', { token: verificationToken.trim() })
      setVerificationToken('')
      setMessage('Verified as ' + (result?.username ?? 'a StrawHats member') + '. Full clan access is now enabled.')
      await onProfileChanged?.()
    } catch (error: any) {
      setMessage(error.message ?? 'Could not verify your Koruxa membership.')
    } finally {
      setVerifying(false)
    }
  }


  return (
    <div className="page orders-page">
      <header className="exchange-hero">
        <div className="exchange-hero-glow" />
        <div>
          <span className="exchange-kicker">{outsider ? 'STRAWHATS [HAKI] PUBLIC EXCHANGE' : 'STRAWHATS [HAKI] EXCHANGE'}</span>
          <h1>{outsider ? 'Order Exchange' : 'Clan Order Board'}</h1>
          <p>{outsider
            ? 'Place an order with StrawHats. Your account can only see the Orders area and your own requests.'
            : 'Place polished, easy-to-read orders and keep every request visible from creation to collection.'}</p>
        </div>
        <div className="exchange-hero-badge">
          <span>LIVE</span>
          <strong>{counts.active}</strong>
          <small>{outsider ? 'your active orders' : 'active orders'}</small>
        </div>
      </header>

      {outsider ? <section className="panel outsider-access-card">
        <div className="panel-title">
          <div>
            <span className="eyebrow">OUTSIDER ACCESS</span>
            <h2>Orders only</h2>
            <p className="muted">You can place and track your own orders, but you cannot see the clan home, roster, bank, leaderboards, planner, crafters or Admin.</p>
          </div>
        </div>
        <details>
          <summary>Are you actually a StrawHats member?</summary>
          <div className="stack outsider-verify-form">
            <p className="muted">Enter your personal read-only Koruxa API token. It is checked against the synced StrawHats roster and encrypted server-side.</p>
            <input type="password" value={verificationToken} onChange={(e) => setVerificationToken(e.target.value)} placeholder="kxu_…" />
            <button className="secondary-button" type="button" disabled={!verificationToken.trim() || verifying} onClick={verifyClanMembership}>
              {verifying ? 'Verifying…' : 'Verify clan membership'}
            </button>
          </div>
        </details>
      </section> : null}

      <section className="exchange-section">
        <div className="exchange-section-title">
          <div><span className="eyebrow">PLACE AN ORDER</span><h2>Choose an order board</h2></div>
          <span className="muted">{activeCategoryInfo?.description}</span>
        </div>

        <div className="order-category-tabs">
          {categories.map((category) => (
            <button
              key={category.id}
              className={activeCategory === category.id ? 'order-category-tab active' : 'order-category-tab'}
              onClick={() => setActiveCategory(category.id)}
            >
              <span className="order-tab-icon">{({
                'ore-gems': '⛏️',
                fish: '🐟',
                smithing: '🔨',
                crafting: '🧵',
                jewelery: '💍',
                herblore: '🧪',
                fletching: '🏹',
                farming: '🌱',
                arcana: '🔮',
                'logs-seeds': '🪵',
                thieving: '🗝️',
                construction: '🪚',
                tinkering: '⚙️',
                combat: '⚔️',
              } as Record<string,string>)[category.id] ?? '✦'}</span>
              <span><strong>{categoryDisplayLabel(category)}</strong><small>{
                category.id === 'ore-gems' ? 'Ore & gem market' :
                category.id === 'fish' ? 'Fish & cooked food' :
                category.id === 'herblore' ? 'Potions & Overloads' :
                category.id === 'arcana' ? 'Rune orders' :
                category.id === 'logs-seeds' ? 'Logs & seed supplies' :
                category.id === 'thieving' ? 'Thieving loot' :
                category.id === 'construction' ? 'Construction crafts' :
                category.id === 'tinkering' ? 'Tinkering crafts' :
                category.id === 'combat' ? 'Supplier-selected drops' :
                'Full Koruxa catalogue'
              }</small></span>
            </button>
          ))}
        </div>

        <section className="shop-supplier-panel">
          <div className="shop-supplier-head">
            <div>
              <span className="eyebrow">SHOP OWNERS</span>
              <h3>Available suppliers</h3>
              <p>These are the clan members designated to fulfil {categoryDisplayLabel(activeCategoryInfo ?? ({ id: activeCategory, label: 'this shop' } as OrderCategory))} orders.</p>
            </div>
            {mySupplier ? <button
              type="button"
              className={mySupplier.status === 'busy' ? 'supplier-toggle reopen' : 'supplier-toggle'}
              onClick={toggleMySupplierStatus}
            >
              {mySupplier.status === 'busy' ? '✓ Reopen shop' : '⏸ Mark myself busy'}
            </button> : null}
          </div>

          <div className="shop-supplier-list">
            {activeSuppliers.length ? activeSuppliers.map((supplier) => (
              <div className={'shop-supplier-chip ' + supplier.status} key={supplier.profile_id}>
                <span className="supplier-status-dot" />
                <div>
                  <strong>{supplier.name}{supplier.is_self ? ' · You' : ''}</strong>
                  <small>{supplier.status === 'busy' ? 'Busy / temporarily unavailable' : 'Available to fulfil orders'}</small>
                </div>
              </div>
            )) : <div className="shop-no-suppliers">No designated suppliers have been assigned to this shop yet.</div>}
          </div>

          {activeSuppliers.length === 0 ? <div className="shop-warning danger">
            <strong>⚠ No suppliers assigned</strong>
            <span>You can still place an order, but there is currently nobody designated to fulfil this shop.</span>
          </div> : availableSuppliers.length === 0 ? <div className="shop-warning danger">
            <strong>⚠ All suppliers are currently busy</strong>
            <span>Your order can still be submitted, but it may remain unfilled until a supplier reopens their shop.</span>
          </div> : busySuppliers.length > 0 ? <div className="shop-warning">
            <strong>⚠ One or more suppliers are currently unavailable</strong>
            <span>Please check the supplier list above. Orders are still accepted, but fulfilment may take longer.</span>
          </div> : <div className="shop-open-note">
            <span>●</span>
            <strong>Shop open</strong>
            <small>{availableSuppliers.length} supplier{availableSuppliers.length === 1 ? '' : 's'} currently available.</small>
          </div>}
        </section>

        <div className={'exchange-board exchange-board-' + (activeCategory || 'generic')}>
          {activeCategory === 'fish' ? <div className="stack">
              <FishOrderForm onSubmit={insertOrder} />
              <CatalogueOrderForm
                skillKey="cooking"
                title="Cooking · Non-Fish Food"
                subtitle="Bread, popcorn, fruit dishes, pies, preserves and the other non-fish Cooking recipes."
                excludeLabels={cookedFishLabels}
                onSubmit={insertOrder}
              />
            </div> :
            activeCategory === 'ore-gems' ? <OreGemOrderForm onSubmit={insertOrder} /> :
            activeCategory === 'herblore' ? <PotionOrderForm onSubmit={insertOrder} /> :
            activeCategory === 'smithing' ? <CatalogueOrderForm skillKey="smithing" title="Smithing" onSubmit={insertOrder} /> :
            activeCategory === 'crafting' ? <CatalogueOrderForm skillKey="crafting" title="Crafting" onSubmit={insertOrder} /> :
            activeCategory === 'fletching' ? <CatalogueOrderForm skillKey="fletching" title="Fletching" onSubmit={insertOrder} /> :
            activeCategory === 'jewelery' ? <CatalogueOrderForm skillKey="jewelery" title="Jewellery" subtitle="CUT gems only — jewellery uses the cut versions of gems, never the uncut Mining drops." onSubmit={insertOrder} /> :
            activeCategory === 'logs-seeds' ? <CatalogueOrderForm skillKey="logs-seeds" title="Logs & Seeds" subtitle="Woodcutting logs plus seeds sourced from the official Koruxa Woodcutting drop tables." onSubmit={insertOrder} /> :
            activeCategory === 'farming' ? <CatalogueOrderForm skillKey="farming" title="Farming" onSubmit={insertOrder} /> :
            activeCategory === 'arcana' ? <CatalogueOrderForm skillKey="arcana" title="Arcana · Runes" subtitle="Order crafted runes directly from the Arcana catalogue." onSubmit={insertOrder} /> :
            activeCategory === 'thieving' ? <CatalogueOrderForm skillKey="thieving" title="Thieving Supplies" subtitle="Loot is grouped by the Thieving node it can be obtained from." onSubmit={insertOrder} /> :
            activeCategory === 'construction' ? <CatalogueOrderForm skillKey="construction" title="Construction" onSubmit={insertOrder} /> :
            activeCategory === 'tinkering' ? <CatalogueOrderForm skillKey="tinkering" title="Tinkering" onSubmit={insertOrder} /> :
            activeCategory === 'combat' ? <CombatOrderForm onSubmit={insertOrder} /> :
            <div className="order-board-main"><div className="notice">This order board is not configured.</div></div>}
        </div>
        {message ? <p className="notice">{message}</p> : null}
      </section>

      <section className="exchange-section">
        <div className="exchange-section-title">
          <div><span className="eyebrow">ORDER CENTRE</span><h2>Current requests & history</h2></div>
          <span className="muted">Your own requests stay visible here with their full item breakdown.</span>
        </div>

        <div className="order-view-tabs">
          {(outsider ? ([
            ['mine', 'My Requests', counts.mine],
            ['history', 'History', counts.history],
          ] as Array<[QueueView, string, number]>) : ([
            ['mine', 'My Requests', counts.mine],
            ['claimable', 'Claimable', counts.claimable],
            ['working', 'Working On', counts.working],
            ['ready', 'Ready', counts.ready],
            ['active', 'All Active', counts.active],
            ['history', 'History', counts.history],
          ] as Array<[QueueView, string, number]>)).map(([key, label, count]) => (
            <button key={key} className={queueView === key ? 'order-view-tab active' : 'order-view-tab'} onClick={() => setQueueView(key)}>
              {label}<span>{count}</span>
            </button>
          ))}
        </div>

        <div className="order-grid order-grid-detailed">
          {visible.map((order) => {
            const mine = order.requester_profile_id === currentProfile.id
            const claimedByMe = order.claimed_by === currentProfile.id
            const lines = orderLines(order)
            const total = orderTotal(order)
            const notes = orderNotes(order)
            const canCancel = mine && ['open', 'claimed', 'in_progress'].includes(order.status)
            const canClaim = order.status === 'open' && !mine && mySupplierCategories.has(order.category_id)

            return (
              <article className={'order-ticket status-' + order.status} key={order.id}>
                <div className="order-ticket-top">
                  <div>
                    <span className="order-ticket-category">{order.category?.label ?? order.category_id}</span>
                    <h3>{order.summary}</h3>
                  </div>
                  <span className={'pill ' + (order.status === 'ready' ? 'success' : order.status === 'cancelled' ? 'danger' : order.status === 'open' ? '' : 'warning')}>
                    {order.status.replace('_', ' ')}
                  </span>
                </div>

                <div className="order-ticket-meta">
                  <span>Requested by <strong>{order.requester?.koruxa_name ?? order.requester?.display_name ?? 'Clan member'}</strong></span>
                  <span>{new Date(order.created_at).toLocaleString()}</span>
                  {order.claimer ? <span>Fulfiller <strong>{order.claimer.koruxa_name ?? order.claimer.display_name}</strong></span> : null}
                </div>

                {lines.length ? <div className="order-ticket-lines">
                  {lines.map((line: any, index: number) => (
                    <div className="order-ticket-line" key={index}>
                      <div>
                        <strong>{line.description ?? line.item ?? 'Order item'}</strong>
                        {line.required_for_gems ? <small>{Number(line.required_for_gems).toLocaleString()} matching ore included automatically</small> : null}
                        {Array.isArray(line.materials) && line.materials.length ? <small>Materials: {line.materials.map((material: any) => Number(material.quantity).toLocaleString() + ' ' + (material.item ?? material.item_key)).join(' · ')}</small> : null}
                        {Array.isArray(line.give) && line.give.length ? <small>Give: {line.give.map((entry: any) => Number(entry.amount).toLocaleString() + ' ' + entry.name).join(' · ')}</small> : null}
                      </div>
                      {line.line_total != null ? <strong>{Number(line.line_total).toLocaleString()} GP</strong> : null}
                    </div>
                  ))}
                </div> : null}

                {notes ? <div className="order-ticket-notes"><strong>Notes</strong><p>{notes}</p></div> : null}
                {total ? <div className="order-ticket-total"><span>Total</span><strong>{total.toLocaleString()} GP</strong></div> : null}

                <div className="button-row">
                  {canClaim ? <button className="primary-button" onClick={() => transition(order, 'claim')}>Claim order</button> : null}
                  {order.status === 'open' && mine ? <span className="muted">Waiting for another clan member to claim this order.</span> : null}
                  {['claimed', 'in_progress'].includes(order.status) && claimedByMe ? <button className="primary-button" onClick={() => transition(order, 'ready')}>Mark ready</button> : null}
                  {order.status === 'ready' && mine ? <button className="primary-button" onClick={() => transition(order, 'collected')}>Mark collected</button> : null}
                  {canCancel ? <button className="danger-button" onClick={() => {
                    const wording = order.status === 'open' ? 'delete this order' : 'cancel this order'
                    if (window.confirm('Are you sure you want to ' + wording + '?')) transition(order, 'cancel')
                  }}>{order.status === 'open' ? 'Delete order' : 'Cancel order'}</button> : null}
                </div>
              </article>
            )
          })}
          {!visible.length ? <div className="panel order-empty-state"><strong>Nothing here yet.</strong><p className="muted">Orders will appear here as they move through the clan workflow.</p></div> : null}
        </div>
      </section>
    </div>
  )
}
