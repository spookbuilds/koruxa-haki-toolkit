import { NavLink } from 'react-router-dom'
import type { Profile } from '../types'

const links = [
  ['/', 'Clan Home'],
  ['/members', 'Members'],
  ['/leaderboards', 'Leaderboards'],
  ['/planner', 'Skill Planner'],
  ['/crafters', 'Who Can Make This?'],
  ['/orders', 'Orders'],
  ['/bank', 'Clan Bank'],
  ['/admin', 'Admin'],
] as const

export default function Shell({ profile, onSignOut, children }: { profile: Profile | null; onSignOut: () => void; children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">H</div>
          <div><strong>HAKI Toolkit</strong><span>Koruxa clan companion</span></div>
        </div>
        <nav>
          {links.map(([to, label]) => (
            <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="user-chip">
            <strong>{profile?.koruxa_name ?? profile?.display_name ?? 'Demo user'}</strong>
            <span>{profile?.app_role ?? 'member'}</span>
          </div>
          <button className="ghost-button" onClick={onSignOut}>Sign out</button>
        </div>
      </aside>
      <main className="main-content">{children}</main>
    </div>
  )
}
