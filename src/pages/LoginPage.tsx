export default function LoginPage({ setupRequired, error }: { setupRequired?: boolean; error?: string }) {
  return (
    <div className="login-screen">
      <section className="login-card">
        <div className="brand large">
          <div className="brand-mark">H</div>
          <div><strong>HAKI Toolkit</strong><span>StrawHats clan companion</span></div>
        </div>
        <h1>Everything your Koruxa clan needs, in one place.</h1>
        <p className="muted">Live clan data, skill leaderboards, personalised planning, orders, bank watch and Discord notifications.</p>

        {setupRequired ? (
          <div className="notice danger-note">
            <strong>One setup step remains:</strong> the Cloudflare D1 database schema has not been applied yet.
          </div>
        ) : (
          <div className="stack">
            <a className="primary-button discord-login" href="/api/auth/discord">Sign in with Discord</a>
            <p className="muted">Discord identifies your HAKI Toolkit account. Your Koruxa character is linked separately using its read-only personal API token.</p>
          </div>
        )}

        {error && !setupRequired ? <div className="notice">{error}</div> : null}
      </section>
    </div>
  )
}
