import { useEffect, useMemo, useState } from 'react'
import { apiGet } from '../lib/api'

export default function BankPage() {
  const [bank, setBank] = useState<any>(null)
  const [watch, setWatch] = useState<any[]>([])
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState<number | 'all'>('all')

  useEffect(() => {
    Promise.all([
      apiGet<{ state: any }>('/api/clan/state'),
      apiGet<{ watch: any[] }>('/api/bank/watch'),
    ]).then(([stateResult, watchResult]) => {
      setBank(stateResult.state?.bank_json ?? null)
      setWatch(watchResult.watch ?? [])
    }).catch(console.error)
  }, [])

  const items = useMemo(() => (bank?.items ?? []).filter((item: any) => {
    const matchesQuery = !query || String(item.name).toLowerCase().includes(query.toLowerCase())
    const matchesTab = tab === 'all' || Number(item.tab_id) === tab
    return matchesQuery && matchesTab
  }), [bank, query, tab])

  const tabs = bank?.tabs ?? []
  const augments = bank?.augments ?? []
  const activity = (bank?.log ?? []).slice(0, 25)

  return (
    <div className="page">
      <header className="page-header"><div><span className="eyebrow">LIVE CLAN STOCK</span><h1>Clan Bank</h1><p className="muted">The dashboard watch list only tracks items your officers actually care about.</p></div></header>

      <section className="stat-grid">
        <div className="stat-card"><span className="eyebrow">Coins</span><strong className="stat-value">{Number(bank?.coins ?? 0).toLocaleString()}</strong></div>
        <div className="stat-card"><span className="eyebrow">Item types</span><strong className="stat-value">{Number(bank?.item_count ?? 0).toLocaleString()}</strong></div>
        <div className="stat-card"><span className="eyebrow">Augment vault</span><strong className="stat-value">{Number(bank?.augment_count ?? 0)} / {Number(bank?.augment_vault_cap ?? 0)}</strong></div>
        <div className="stat-card"><span className="eyebrow">Watched items</span><strong className="stat-value">{watch.length}</strong></div>
      </section>

      <section className="panel">
        <div className="panel-title"><div><span className="eyebrow">WATCH LIST</span><h2>Stock targets</h2></div></div>
        {watch.length ? watch.map((item) => (
          <div className="list-row" key={item.item_key}>
            <div><strong>{item.display_name}</strong><span>Current {Number(item.quantity ?? 0).toLocaleString()} · Minimum {Number(item.minimum_qty).toLocaleString()}{item.preferred_qty ? ' · Preferred ' + Number(item.preferred_qty).toLocaleString() : ''}</span></div>
            <span className={'pill ' + (item.status === 'healthy' ? 'success' : item.status === 'low' ? 'warning' : 'danger')}>{item.status}</span>
          </div>
        )) : <p className="empty">No watched items yet. Owners and officers can add them in Admin.</p>}
      </section>

      <section className="panel">
        <div className="toolbar">
          <input className="search-input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search bank…" />
          <select value={String(tab)} onChange={(e) => setTab(e.target.value === 'all' ? 'all' : Number(e.target.value))}>
            <option value="all">All tabs</option>
            {tabs.map((entry: any) => <option value={entry.id} key={entry.id}>{entry.name}</option>)}
          </select>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Item</th><th>Category</th><th>Qty</th><th>Unit value</th><th>Total value</th></tr></thead>
            <tbody>{items.map((item: any) => (
              <tr key={item.item_key + '-' + item.tab_id}>
                <td><strong>{item.name}</strong></td><td>{item.category}</td><td>{Number(item.quantity).toLocaleString()}</td><td>{Number(item.unit_value).toLocaleString()}</td><td>{Number(item.total_value).toLocaleString()}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </section>

      <div className="two-column">
        <section className="panel">
          <div className="panel-title"><div><span className="eyebrow">AUGMENT VAULT</span><h2>{augments.length} stored augments</h2></div></div>
          <div className="chip-wrap">{Object.entries(augments.reduce((acc: Record<string, number>, item: any) => {
            acc[item.name] = (acc[item.name] ?? 0) + 1
            return acc
          }, {})).map(([name, count]) => <span className="pill" key={name}>{name} × {Number(count)}</span>)}</div>
        </section>

        <section className="panel">
          <div className="panel-title"><div><span className="eyebrow">RECENT ACTIVITY</span><h2>Bank movement</h2></div></div>
          {activity.length ? activity.map((entry: any, index: number) => {
            const qty = Number(entry.quantity ?? entry.qty ?? 0)
            const action = String(entry.action ?? entry.type ?? entry.event ?? '').toLowerCase()
            const prefix = action.includes('withdraw') ? '−' : '+'
            const dateValue = entry.created_at ?? entry.at ?? entry.timestamp
            return <div className="list-row" key={String(entry.id ?? index)}><div><strong>{prefix}{Math.abs(qty).toLocaleString()} {entry.item_name ?? entry.name ?? entry.item_key ?? 'Item'}</strong><span>{entry.character ?? entry.character_name ?? entry.username ?? 'Clan member'} · {action || 'bank activity'}</span></div><span className="muted">{dateValue ? new Date(dateValue).toLocaleString() : ''}</span></div>
          }) : <p className="empty">Sync the clan bank to load recent activity.</p>}
        </section>
      </div>
    </div>
  )
}
