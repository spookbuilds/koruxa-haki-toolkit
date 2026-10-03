import { FormEvent, useEffect, useMemo, useState } from 'react'
import { getOrderCategories, getOrders, notifyDiscord } from '../lib/data'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import type { ClanOrder, OrderCategory, Profile } from '../types'

export default function OrdersPage({ currentProfile }: { currentProfile: Profile | null }) {
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

  useEffect(() => { refresh().catch(console.error) }, [])

  const visible = useMemo(
    () => orders.filter((order) => !activeCategory || order.category_id === activeCategory),
    [orders, activeCategory],
  )

  const createOrder = async (event: FormEvent) => {
    event.preventDefault()
    if (!summary.trim()) return
    if (!supabase || !currentProfile) {
      setMessage('Demo mode does not write orders.')
      return
    }
    const { data, error } = await supabase
      .from('orders')
      .insert({ category_id: activeCategory, requester_profile_id: currentProfile.id, summary: summary.trim(), payload: {} })
      .select('id')
      .single()
    if (error) return setMessage(error.message)
    setSummary('')
    setMessage('Order created and queued for Discord.')
    await notifyDiscord(data.id, 'created')
    await refresh()
  }

  const claim = async (order: ClanOrder) => {
    if (!supabase) return setMessage('Demo mode does not write orders.')
    const { error } = await supabase.rpc('claim_order', { target_order: order.id })
    if (error) return setMessage(error.message)
    await notifyDiscord(order.id, 'claimed')
    await refresh()
  }

  const markReady = async (order: ClanOrder) => {
    if (!supabase) return setMessage('Demo mode does not write orders.')
    const { error } = await supabase.rpc('mark_order_ready', { target_order: order.id })
    if (error) return setMessage(error.message)
    await notifyDiscord(order.id, 'ready')
    await refresh()
  }

  const markCollected = async (order: ClanOrder) => {
    if (!supabase) return setMessage('Demo mode does not write orders.')
    const { error } = await supabase.rpc('mark_order_collected', { target_order: order.id })
    if (error) return setMessage(error.message)
    await notifyDiscord(order.id, 'collected')
    await refresh()
  }

  return (
    <div className="page">
      <header className="page-header"><div><span className="eyebrow">PLAYER-TO-PLAYER ORDERS</span><h1>Orders</h1><p className="muted">Separate tabs keep each skill queue clear. Clan-bank stock is intentionally not mixed into paid orders.</p></div></header>

      <div className="tab-strip">
        {categories.map((category) => (
          <button key={category.id} className={activeCategory === category.id ? 'tab active' : 'tab'} onClick={() => setActiveCategory(category.id)}>
            {category.label}
          </button>
        ))}
      </div>

      <section className="panel">
        <form className="inline-form" onSubmit={createOrder}>
          <input value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="e.g. 5,000 Cooked Tidecrusher" required />
          <button className="primary-button">Place order</button>
        </form>
        {message ? <p className="notice">{message}</p> : null}
      </section>

      <section className="order-grid">
        {visible.map((order) => {
          const mine = order.requester_profile_id === currentProfile?.id
          const claimedByMe = order.claimed_by === currentProfile?.id
          return (
            <article className="panel compact order-card" key={order.id}>
              <div className="order-top">
                <span className={'pill ' + (order.status === 'ready' ? 'success' : order.status === 'open' ? '' : 'warning')}>{order.status.replace('_', ' ')}</span>
                <span className="muted">{new Date(order.created_at).toLocaleString()}</span>
              </div>
              <h2>{order.summary}</h2>
              <p className="muted">Requested by <strong>{order.requester?.koruxa_name ?? 'Clan member'}</strong></p>
              {order.claimer ? <p className="muted">Claimed by <strong>{order.claimer.koruxa_name ?? order.claimer.display_name}</strong></p> : null}
              <div className="button-row">
                {order.status === 'open' && !mine ? <button className="primary-button" onClick={() => claim(order)}>Claim order</button> : null}
                {['claimed', 'in_progress'].includes(order.status) && claimedByMe ? <button className="primary-button" onClick={() => markReady(order)}>Mark ready</button> : null}
                {order.status === 'ready' && mine ? <button className="primary-button" onClick={() => markCollected(order)}>Collected</button> : null}
              </div>
            </article>
          )
        })}
        {!visible.length ? <div className="panel"><p className="empty">No orders in this tab yet.</p></div> : null}
      </section>
    </div>
  )
}
