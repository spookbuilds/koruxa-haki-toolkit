import { FormEvent, useEffect, useMemo, useState } from 'react'
import FishOrderForm from '../components/FishOrderForm'
import OreGemOrderForm from '../components/OreGemOrderForm'
import { getOrderCategories, getOrders } from '../lib/data'
import { apiPost } from '../lib/api'
import type { ClanOrder, OrderCategory, Profile } from '../types'

type QueueView = 'mine' | 'claimable' | 'working' | 'ready' | 'active' | 'history'

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

export default function OrdersPage({ currentProfile }: { currentProfile: Profile }) {
  const [orders, setOrders] = useState<ClanOrder[]>([])
  const [categories, setCategories] = useState<OrderCategory[]>([])
  const [activeCategory, setActiveCategory] = useState('')
  const [queueView, setQueueView] = useState<QueueView>('mine')
  const [summary, setSummary] = useState('')
  const [message, setMessage] = useState('')

  const refresh = async () => {
    const [orderRows, categoryRows] = await Promise.all([getOrders(), getOrderCategories()])
    setOrders(orderRows)
    setCategories(categoryRows)
    if (!activeCategory && categoryRows[0]) setActiveCategory(categoryRows[0].id)
  }

  useEffect(() => { refresh().catch((error) => setMessage(error.message)) }, [])

  const counts = useMemo(() => ({
    mine: orders.filter((order) => order.requester_profile_id === currentProfile.id && !['collected', 'cancelled'].includes(order.status)).length,
    claimable: orders.filter((order) => order.status === 'open' && order.requester_profile_id !== currentProfile.id).length,
    working: orders.filter((order) => ['claimed', 'in_progress'].includes(order.status)).length,
    ready: orders.filter((order) => order.status === 'ready').length,
    active: orders.filter((order) => !['collected', 'cancelled'].includes(order.status)).length,
    history: orders.filter((order) => ['collected', 'cancelled'].includes(order.status)).length,
  }), [orders, currentProfile.id])

  const visible = useMemo(() => orders.filter((order) => {
    if (queueView === 'mine') return order.requester_profile_id === currentProfile.id && !['collected', 'cancelled'].includes(order.status)
    if (queueView === 'claimable') return order.status === 'open' && order.requester_profile_id !== currentProfile.id
    if (queueView === 'working') return ['claimed', 'in_progress'].includes(order.status)
    if (queueView === 'ready') return order.status === 'ready'
    if (queueView === 'history') return ['collected', 'cancelled'].includes(order.status)
    return !['collected', 'cancelled'].includes(order.status)
  }), [orders, queueView, currentProfile.id])

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

  const createGenericOrder = async (event: FormEvent) => {
    event.preventDefault()
    if (!summary.trim()) return
    await insertOrder(summary.trim(), { form: 'generic', notes: '' })
    setSummary('')
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

  return (
    <div className="page orders-page">
      <header className="exchange-hero">
        <div className="exchange-hero-glow" />
        <div>
          <span className="exchange-kicker">STRAWHATS [HAKI] EXCHANGE</span>
          <h1>Clan Order Board</h1>
          <p>Place polished, easy-to-read orders and keep every request visible from creation to collection.</p>
        </div>
        <div className="exchange-hero-badge">
          <span>LIVE</span>
          <strong>{counts.active}</strong>
          <small>active orders</small>
        </div>
      </header>

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
              <span className="order-tab-gem" />
              <span><strong>{category.label}</strong><small>{category.id === 'ore-gems' ? 'Market board' : category.id === 'fish' ? 'Fish market' : 'Clan request'}</small></span>
            </button>
          ))}
        </div>

        <div className={'exchange-board exchange-board-' + (activeCategory || 'generic')}>
          {activeCategory === 'fish' ? <FishOrderForm onSubmit={insertOrder} /> :
            activeCategory === 'ore-gems' ? <OreGemOrderForm onSubmit={insertOrder} /> :
            <div className="generic-order-board">
              <div className="order-board-main">
                <div className="board-heading"><span>HAKI CUSTOM ORDER</span><h2>{activeCategoryInfo?.label ?? 'Clan'} Request</h2></div>
                <form className="stack" onSubmit={createGenericOrder}>
                  <label>What do you need?
                    <textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={4} maxLength={500} placeholder="Describe the item, quantity, quality or any special requirements…" required />
                  </label>
                  <button className="exchange-submit" disabled={!summary.trim()}>Submit {activeCategoryInfo?.label ?? ''} order</button>
                </form>
              </div>
              <aside className="order-board-sidebar">
                <div className="flash-card gold"><span className="flash-icon">✦</span><div><strong>Quick info</strong><p>Be specific about quantity, quality and any special requirements.</p></div></div>
                <div className="flash-card blue"><span className="flash-icon">✓</span><div><strong>Tracked end-to-end</strong><p>Your request stays visible in My Requests until it is collected or cancelled.</p></div></div>
              </aside>
            </div>}
        </div>
        {message ? <p className="notice">{message}</p> : null}
      </section>

      <section className="exchange-section">
        <div className="exchange-section-title">
          <div><span className="eyebrow">ORDER CENTRE</span><h2>Current requests & history</h2></div>
          <span className="muted">Your own requests stay visible here with their full item breakdown.</span>
        </div>

        <div className="order-view-tabs">
          {([
            ['mine', 'My Requests', counts.mine],
            ['claimable', 'Claimable', counts.claimable],
            ['working', 'Working On', counts.working],
            ['ready', 'Ready', counts.ready],
            ['active', 'All Active', counts.active],
            ['history', 'History', counts.history],
          ] as Array<[QueueView, string, number]>).map(([key, label, count]) => (
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
                      <div><strong>{line.description ?? line.item ?? 'Order item'}</strong>{line.required_for_gems ? <small>{Number(line.required_for_gems).toLocaleString()} matching ore included automatically</small> : null}</div>
                      {line.line_total != null ? <strong>{Number(line.line_total).toLocaleString()} GP</strong> : null}
                    </div>
                  ))}
                </div> : null}

                {notes ? <div className="order-ticket-notes"><strong>Notes</strong><p>{notes}</p></div> : null}
                {total ? <div className="order-ticket-total"><span>Total</span><strong>{total.toLocaleString()} GP</strong></div> : null}

                <div className="button-row">
                  {order.status === 'open' && !mine ? <button className="primary-button" onClick={() => transition(order, 'claim')}>Claim order</button> : null}
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
