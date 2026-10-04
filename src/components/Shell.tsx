import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import type { Profile } from '../types'
import hakiLogo from '../../assets/images/haki.png'

const clanLinks = [
  ['/', 'Clan Home', '🏠'],
  ['/members', 'Members', '👥'],
  ['/leaderboards', 'Leaderboards', '🏆'],
  ['/planner', 'Skill Planner', '🧭'],
  ['/crafters', 'Who Can Make This?', '🛠️'],
  ['/orders', 'Orders', '📦'],
  ['/bank', 'Clan Bank', '🏦'],
  ['/admin', 'Admin', '⚙️'],
] as const

const outsiderLinks = [
  ['/orders', 'Orders', '📦'],
] as const

const mobilePrimary = new Set(['/', '/members', '/planner', '/orders'])

export default function Shell({ profile, onSignOut, children }: { profile: Profile | null; onSignOut: () => void; children: React.ReactNode }) {
  const [moreOpen, setMoreOpen] = useState(false)
  const outsider = profile?.access_role === 'outsider' || (!profile?.clan_verified && profile?.app_role !== 'owner')
  const links = outsider ? outsiderLinks : clanLinks
  const primaryLinks = outsider ? links : links.filter(([to]) => mobilePrimary.has(to))
  const moreLinks = outsider ? [] : links.filter(([to]) => !mobilePrimary.has(to))

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><img src={hakiLogo} alt="" aria-hidden="true" /></div>
          <div><strong>HAKI Toolkit</strong><span>{outsider ? 'StrawHats order exchange' : 'Koruxa clan companion'}</span></div>
        </div>
        <nav className="desktop-nav">
          {links.map(([to, label, icon]) => (
            <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              <span className="nav-icon">{icon}</span><span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="user-chip">
            <strong>{profile?.koruxa_name ?? profile?.display_name ?? 'Discord user'}</strong>
            <span>{outsider ? 'Outsider' : profile?.app_role ?? 'member'}</span>
          </div>
          <button className="ghost-button" onClick={onSignOut}>Sign out</button>
        </div>
      </aside>

      <header className="mobile-topbar">
        <div className="brand mobile-brand">
          <div className="brand-mark"><img src={hakiLogo} alt="" aria-hidden="true" /></div>
          <div>
            <strong>HAKI Toolkit</strong>
            <span>{profile?.koruxa_name ?? profile?.display_name ?? (outsider ? 'Outsider' : 'Clan member')}</span>
          </div>
        </div>
        <span className="mobile-role-pill">{outsider ? 'Outsider' : profile?.app_role ?? 'member'}</span>
      </header>

      <main className="main-content">{children}</main>

      <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
        {primaryLinks.map(([to, label, icon]) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            onClick={() => setMoreOpen(false)}
            className={({ isActive }) => isActive ? 'mobile-nav-link active' : 'mobile-nav-link'}
          >
            <span>{icon}</span>
            <small>{label === 'Skill Planner' ? 'Planner' : label}</small>
          </NavLink>
        ))}
        {moreLinks.length ? <button
          type="button"
          className={moreOpen ? 'mobile-nav-link active' : 'mobile-nav-link'}
          onClick={() => setMoreOpen((open) => !open)}
          aria-expanded={moreOpen}
        >
          <span>•••</span>
          <small>More</small>
        </button> : null}
      </nav>

      {moreOpen ? <div className="mobile-more-backdrop" onClick={() => setMoreOpen(false)}>
        <section className="mobile-more-sheet" onClick={(event) => event.stopPropagation()}>
          <div className="mobile-sheet-handle" />
          <div className="mobile-sheet-head">
            <div>
              <span className="eyebrow">MORE</span>
              <h2>HAKI Toolkit</h2>
            </div>
            <button type="button" className="ghost-button" onClick={() => setMoreOpen(false)}>✕</button>
          </div>
          <div className="mobile-more-grid">
            {moreLinks.map(([to, label, icon]) => (
              <NavLink
                key={to}
                to={to}
                onClick={() => setMoreOpen(false)}
                className={({ isActive }) => isActive ? 'mobile-more-link active' : 'mobile-more-link'}
              >
                <span>{icon}</span>
                <strong>{label}</strong>
              </NavLink>
            ))}
          </div>
          <button type="button" className="mobile-signout" onClick={onSignOut}>Sign out</button>
        </section>
      </div> : null}
    </div>
  )
}
