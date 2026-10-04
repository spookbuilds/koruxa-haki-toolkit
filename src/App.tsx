import { useCallback, useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import Shell from './components/Shell'
import { apiGet, apiPost, ApiError } from './lib/api'
import AdminPage from './pages/AdminPage'
import BankPage from './pages/BankPage'
import CraftersPage from './pages/CraftersPage'
import HomePage from './pages/HomePage'
import LeaderboardsPage from './pages/LeaderboardsPage'
import LoginPage from './pages/LoginPage'
import MembersPage from './pages/MembersPage'
import OrdersPage from './pages/OrdersPage'
import PlannerPage from './pages/PlannerPage'
import type { Profile } from './types'

export default function App() {
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [setupRequired, setSetupRequired] = useState(false)
  const [error, setError] = useState('')

  const loadProfile = useCallback(async () => {
    try {
      const data = await apiGet<{ user: Profile | null }>('/api/auth/me')
      setProfile(data.user)
      setSetupRequired(false)
      setError('')
    } catch (err) {
      if (err instanceof ApiError && err.setupRequired) {
        setSetupRequired(true)
        setError(err.message)
      } else {
        setError(err instanceof Error ? err.message : 'Could not load your session.')
      }
      setProfile(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadProfile() }, [loadProfile])

  const signOut = async () => {
    await apiPost('/api/auth/logout')
    setProfile(null)
  }

  if (loading) return <div className="loading-screen">Loading HAKI Toolkit…</div>
  if (!profile) return <LoginPage setupRequired={setupRequired} error={error} />

  const outsider = profile.access_role === 'outsider' || (!profile.clan_verified && profile.app_role !== 'owner')

  return (
    <Shell profile={profile} onSignOut={signOut}>
      <Routes>
        {outsider ? <>
          <Route path="/orders" element={<OrdersPage currentProfile={profile} onProfileChanged={loadProfile} />} />
          <Route path="*" element={<Navigate to="/orders" replace />} />
        </> : <>
          <Route path="/" element={<HomePage />} />
          <Route path="/members" element={<MembersPage currentProfile={profile} onProfileChanged={loadProfile} />} />
          <Route path="/leaderboards" element={<LeaderboardsPage currentProfile={profile} />} />
          <Route path="/planner" element={<PlannerPage currentProfile={profile} />} />
          <Route path="/crafters" element={<CraftersPage />} />
          <Route path="/orders" element={<OrdersPage currentProfile={profile} onProfileChanged={loadProfile} />} />
          <Route path="/bank" element={<BankPage />} />
          <Route path="/admin" element={<AdminPage currentProfile={profile} onProfileChanged={loadProfile} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </>}
      </Routes>
    </Shell>
  )
}
