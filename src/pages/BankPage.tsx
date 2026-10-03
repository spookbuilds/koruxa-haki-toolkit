import { useEffect, useMemo, useState } from 'react'
import { isSupabaseConfigured, supabase } from '../lib/supabase'

export default function BankPage() {
  const [bank, setBank] = useState<any>(null)
  const [watch, setWatch] = useState<any[]>([])
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState<number | 'all'>('all')

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return
    supabase.from('clan_state').select('bank_json').eq('id', 1).maybeSingle().then(({ data }) => setBank(data?.bank_json ?? null))
    supabase.from('bank_watch_status').select('*').order('display_name').then(({ data }) => setWatch(data ?? []))
  }, [])

  const items = useMemo(() => (bank?.items ?? []).filter((item: any) => {
    const matchesQuery = !query || String(item.name).toLowerCase().includes(query.toLowerCase())
    const matchesTab = tab === 'all' || Number(item.tab_id) === tab
    return matchesQuery && matchesTab
  }), [bank, query, tab])

  const tabs = bank?.tabs ?? []
  const augments = bank?.augments ?? []

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
            <div><strong>{item.display_name}</strong><span>Current {Number(item.quantity ?? 0).toLocaleString()} · Minimum {Number(item.minimum_qty).toLocaleString()}</span></div>
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

      <section className="panel">
        <div className="panel-title"><div><span className="eyebrow">AUGMENT VAULT</span><h2>{augments.length} stored augments</h2></div></div>
        <div className="chip-wrap">{Object.entries(augments.reduce((acc: Record<string, number>, item: any) => {
          acc[item.name] = (acc[item.name] ?? 0) + 1
          return acc
        }, {})).map(([name, count]) => <span className="pill" key={name}>{name} × {count}</span>)}</div>
      </section>
    </div>
  )
}
