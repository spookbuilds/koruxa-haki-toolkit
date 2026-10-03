import { FormEvent, useEffect, useMemo, useState } from 'react'
import FishOrderForm from '../components/FishOrderForm'
import OreGemOrderForm from '../components/OreGemOrderForm'
import { getOrderCategories, getOrders } from '../lib/data'
import { apiPost } from '../lib/api'
import type { ClanOrder, OrderCategory, Profile } from '../types'

export default function OrdersPage({ currentProfile }: { currentProfile: Profile }) {
  const [orders, setOrders] = useState<ClanOrder[]>([])
  const [categories, setCategories] = useState<OrderCategory[]>([])
  const [activeCategory, setActiveCategory] = useState('')
  const [summary, setSummary] = useState('')
  const [message, setMessage] = useState('')

  const refresh = async () => {
    const [orderRows, categoryRows] = await Promise.all([getOrders(), getOrderCategories()])
    setOrders(orderRows)
    setCategories(categoryRows)
    if (!activeCategory && categoryRows[0]) setActiveCategory(categoryRows[0].id)
  }

  useEffect(() => { refresh().catch((error) => setMessage(error.message)) }, [])

  const visible = useMemo(
    () => orders.filter((order) => !activeCategory || order.category_id === activeCategory),
    [orders, activeCategory],
  )

  const insertOrder = async (orderSummary: string, payload: Record<string, unknown>) => {
    try {
      await apiPost('/api/orders', { category_id: activeCategory, summary: orderSummary, payload })
      setMessage('Order created and posted to its Discord channel if configured.')
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

  const transition = async (order: ClanOrder, action: 'claim' | 'ready' | 'collected') => {
    try {
      await apiPost('/api/orders/' + order.id + '/' + action)
      setMessage(action === 'claim' ? 'Order claimed.' : action === 'ready' ? 'Order marked ready.' : 'Order marked collected.')
      await refresh()
    } catch (error: any) {
      setMessage(error.message ?? 'Order update failed.')
    }
  }

  return (
    <div className="page">
      <header className="page-header"><div><span className="eyebrow">PLAYER-TO-PLAYER ORDERS</span><h1>Orders</h1><p className="muted">Each order type keeps its own tab and fulfiller permissions. Paid member orders stay separate from clan-bank stock.</p></div></header>

      <div className="tab-strip">
        {categories.map((category) => (
          <button key={category.id} className={activeCategory === category.id ? 'tab active' : 'tab'} onClick={() => setActiveCategory(category.id)}>
            {category.label}
          </button>
        ))}
      </div>

      <section className="panel">
        {activeCategory === 'fish' ? <FishOrderForm onSubmit={insertOrder} /> :
          activeCategory === 'ore-gems' ? <OreGemOrderForm onSubmit={insertOrder} /> :
          <form className="inline-form" onSubmit={createGenericOrder}>
            <input value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="What do you need made?" required />
            <button className="primary-button">Place order</button>
          </form>}
        {message ? <p className="notice">{message}</p> : null}
      </section>

      <section>
        <div className="section-heading"><div><span className="eyebrow">QUEUE</span><h2>{categories.find((category) => category.id === activeCategory)?.label ?? 'Orders'} orders</h2></div></div>
        <div className="order-grid">
          {visible.map((order) => {
            const mine = order.requester_profile_id === currentProfile.id
            const claimedByMe = order.claimed_by === currentProfile.id
            return (
              <article className="panel compact order-card" key={order.id}>
                <div className="order-top">
                  <span className={'pill ' + (order.status === 'ready' ? 'success' : order.status === 'open' ? '' : 'warning')}>{order.status.replace('_', ' ')}</span>
                  <span className="muted">{new Date(order.created_at).toLocaleString()}</span>
                </div>
                <h2>{order.summary}</h2>
                <p className="muted">Requested by <strong>{order.requester?.koruxa_name ?? order.requester?.display_name ?? 'Clan member'}</strong></p>
                {order.claimer ? <p className="muted">Claimed by <strong>{order.claimer.koruxa_name ?? order.claimer.display_name}</strong></p> : null}
                <div className="button-row">
                  {order.status === 'open' && !mine ? <button className="primary-button" onClick={() => transition(order, 'claim')}>Claim order</button> : null}
                  {order.status === 'open' && mine ? <span className="muted">Waiting for another clan member to claim this order.</span> : null}
                  {['claimed', 'in_progress'].includes(order.status) && claimedByMe ? <button className="primary-button" onClick={() => transition(order, 'ready')}>Mark ready</button> : null}
                  {order.status === 'ready' && mine ? <button className="primary-button" onClick={() => transition(order, 'collected')}>Collected</button> : null}
                </div>
              </article>
            )
          })}
          {!visible.length ? <div className="panel"><p className="empty">No orders in this tab yet.</p></div> : null}
        </div>
      </section>
    </div>
  )
}
