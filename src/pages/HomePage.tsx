import { useEffect, useMemo, useState } from 'react'
import StatCard from '../components/StatCard'
import { getOrders } from '../lib/data'
import { apiGet } from '../lib/api'
import type { ClanOrder } from '../types'

export default function HomePage() {
  const [orders, setOrders] = useState<ClanOrder[]>([])
  const [clan, setClan] = useState<any>(null)
  const [watch, setWatch] = useState<any[]>([])

  useEffect(() => {
    Promise.all([
      getOrders(),
      apiGet<{ state: any }>('/api/clan/state'),
      apiGet<{ watch: any[] }>('/api/bank/watch'),
    ]).then(([orderRows, clanResult, watchResult]) => {
      setOrders(orderRows)
      setClan(clanResult.state)
      setWatch((watchResult.watch ?? []).filter((item) => item.show_on_home))
    }).catch(console.error)
  }, [])

  const working = useMemo(() => orders.filter((o) => ['claimed', 'in_progress'].includes(o.status)), [orders])
  const ready = useMemo(() => orders.filter((o) => o.status === 'ready'), [orders])
  const open = useMemo(() => orders.filter((o) => o.status === 'open'), [orders])
  const clanData = clan?.clan_json
  const bankData = clan?.bank_json
  const xp = clanData?.xp
  const currentWeek = clanData?.weekly?.[0]

  return (
    <div className="page">
      <header className="page-header"><div><span className="eyebrow">STRAWHATS [HAKI]</span><h1>Clan Home</h1><p className="muted">Live clan status, work queue and the stock you actually care about.</p></div></header>
      <section className="stat-grid">
        <StatCard label="Clan level" value={xp?.level ?? '—'} hint={xp ? String(xp.progress_pct) + '% to level ' + String(xp.level + 1) : 'Run the first clan sync in Admin'} />
        <StatCard label="Members" value={clanData?.clan?.member_count ?? '—'} hint="Roster syncs from Koruxa" />
        <StatCard label="Open orders" value={open.length} hint={String(working.length) + ' being worked'} />
        <StatCard label="Ready" value={ready.length} hint="Ready for collection" />
      </section>

      {currentWeek ? <section className="stat-grid">
        <StatCard label="Clan XP this week" value={Number(currentWeek.xp ?? 0).toLocaleString()} hint={String(currentWeek.active_members ?? 0) + ' active members'} />
        <StatCard label="Quests this week" value={Number(currentWeek.quests ?? 0).toLocaleString()} />
        <StatCard label="Firepit this week" value={Number(currentWeek.firepit_hours ?? 0).toLocaleString() + 'h'} />
        <StatCard label="Bank value this week" value={Number(currentWeek.bank_value ?? 0).toLocaleString()} />
      </section> : null}

      <div className="two-column">
        <section className="panel">
          <div className="panel-title"><div><span className="eyebrow">OPEN ORDERS</span><h2>Waiting to be claimed</h2></div></div>
          {open.length ? open.slice(0, 8).map((order) => (
            <div className="list-row" key={order.id}>
              <div><strong>{order.summary}</strong><span>requested by {order.requester?.koruxa_name ?? order.requester?.display_name ?? 'Clan member'}</span></div>
              <span className="pill">open</span>
            </div>
          )) : <p className="empty">No open orders waiting for a fulfiller.</p>}
        </section>

        <section className="panel">
          <div className="panel-title"><div><span className="eyebrow">LIVE WORK</span><h2>Currently working on</h2></div></div>
          {working.length ? working.map((order) => (
            <div className="list-row" key={order.id}>
              <div><strong>{order.summary}</strong><span>for {order.requester?.koruxa_name ?? order.requester?.display_name ?? 'Clan member'}</span></div>
              <span className="pill warning">{order.status.replace('_', ' ')}</span>
            </div>
          )) : <p className="empty">Nobody has claimed an order yet.</p>}
        </section>
      </div>

      <div className="two-column">
        <section className="panel">
          <div className="panel-title"><div><span className="eyebrow">WATCH LIST</span><h2>Clan bank stock</h2></div></div>
          {watch.length ? watch.slice(0, 8).map((item) => (
            <div className="list-row" key={item.item_key}>
              <div><strong>{item.display_name}</strong><span>{Number(item.quantity ?? 0).toLocaleString()} in bank</span></div>
              <span className={'pill ' + (item.status === 'healthy' ? 'success' : item.status === 'low' ? 'warning' : 'danger')}>{item.status}</span>
            </div>
          )) : <p className="empty">Officers can choose exactly which bank items appear here.</p>}
        </section>
      </div>

      <div className="two-column">
        <section className="panel">
          <div className="panel-title"><div><span className="eyebrow">READY</span><h2>Waiting for collection</h2></div></div>
          {ready.length ? ready.slice(0, 8).map((order) => <div className="list-row" key={order.id}><div><strong>{order.summary}</strong><span>{order.requester?.koruxa_name ?? order.requester?.display_name ?? 'Clan member'}</span></div><span className="pill success">ready</span></div>) : <p className="empty">Nothing waiting for collection.</p>}
        </section>
        <section className="panel">
          <div className="panel-title"><div><span className="eyebrow">AUGMENT VAULT</span><h2>Capacity</h2></div></div>
          <div className="vault-meter"><strong>{Number(bankData?.augment_count ?? 0)} / {Number(bankData?.augment_vault_cap ?? 0)}</strong><span className={Number(bankData?.augment_count ?? 0) >= Number(bankData?.augment_vault_cap ?? 1) - 5 ? 'pill danger' : 'pill success'}>{Number(bankData?.augment_vault_cap ?? 0) ? Number(bankData.augment_vault_cap) - Number(bankData.augment_count ?? 0) + ' slots free' : 'Sync bank to view'}</span></div>
        </section>
      </div>
    </div>
  )
}
