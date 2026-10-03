import { FormEvent, useState } from 'react'
import { isSupabaseConfigured, supabase } from '../lib/supabase'

export default function LoginPage({ onDemo }: { onDemo: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [message, setMessage] = useState('')

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!supabase) return
    setMessage('Working…')
    const result = mode === 'signin'
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password })
    setMessage(result.error ? result.error.message : mode === 'signup' ? 'Account created. Check your email if confirmation is enabled.' : 'Signed in.')
  }

  return (
    <div className="login-screen">
      <section className="login-card">
        <div className="brand large"><div className="brand-mark">H</div><div><strong>HAKI Toolkit</strong><span>StrawHats clan companion</span></div></div>
        <h1>Everything your Koruxa clan needs, in one place.</h1>
        <p className="muted">Live clan data, skill leaderboards, personalised planning, orders, bank watch and Discord notifications.</p>
        {isSupabaseConfigured ? (
          <form onSubmit={submit} className="stack">
            <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
            <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} /></label>
            <button className="primary-button" type="submit">{mode === 'signin' ? 'Sign in' : 'Create account'}</button>
            <button className="link-button" type="button" onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}>
              {mode === 'signin' ? 'Need an account?' : 'Already have an account?'}
            </button>
            {message ? <p className="notice">{message}</p> : null}
          </form>
        ) : (
          <div className="stack">
            <div className="notice">Supabase is not configured yet. You can still browse the UI in demo mode.</div>
            <button className="primary-button" onClick={onDemo}>Open demo</button>
          </div>
        )}
      </section>
    </div>
  )
}
