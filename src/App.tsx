import { useCallback, useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import Shell from './components/Shell'
import { demoProfiles } from './data/demo'
import { isSupabaseConfigured, supabase } from './lib/supabase'
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
  const [loading, setLoading] = useState(isSupabaseConfigured)
  const [signedIn, setSignedIn] = useState(false)
  const [demo, setDemo] = useState(false)
  const [profile, setProfile] = useState<Profile | null>(null)

  const loadProfile = useCallback(async () => {
    if (!supabase) return
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) { setProfile(null); return }
    const { data } = await supabase.from('profiles').select('*').eq('id', auth.user.id).maybeSingle()
    setProfile(data as Profile | null)
  }, [])

  useEffect(() => {
    if (!supabase) { setLoading(false); return }
    supabase.auth.getSession().then(async ({ data }) => {
      setSignedIn(Boolean(data.session))
      if (data.session) await loadProfile()
      setLoading(false)
    })
    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSignedIn(Boolean(session))
      if (session) await loadProfile()
      else setProfile(null)
    })
    return () => listener.subscription.unsubscribe()
  }, [loadProfile])

  const signOut = async () => {
    if (demo) { setDemo(false); return }
    await supabase?.auth.signOut()
  }

  if (loading) return <div className="loading-screen">Loading HAKI Toolkit…</div>
  if (!signedIn && !demo) return <LoginPage onDemo={() => { setDemo(true); setProfile(demoProfiles[0]) }} />

  const activeProfile = demo ? demoProfiles[0] : profile

  return (
    <Shell profile={activeProfile} onSignOut={signOut}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/members" element={<MembersPage currentProfile={activeProfile} />} />
        <Route path="/leaderboards" element={<LeaderboardsPage />} />
        <Route path="/planner" element={<PlannerPage />} />
        <Route path="/crafters" element={<CraftersPage />} />
        <Route path="/orders" element={<OrdersPage currentProfile={activeProfile} />} />
        <Route path="/bank" element={<BankPage />} />
        <Route path="/admin" element={<AdminPage currentProfile={activeProfile} onProfileChanged={loadProfile} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
  )
}
