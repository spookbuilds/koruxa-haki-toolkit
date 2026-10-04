export default function LoginPage({ setupRequired, error }: { setupRequired?: boolean; error?: string }) {
  return (
    <div className="login-screen">
      <section className="login-card">
        <div className="brand large">
          <div className="brand-mark">H</div>
          <div><strong>HAKI Toolkit</strong><span>StrawHats clan companion</span></div>
        </div>
        <h1>Everything your Koruxa clan needs, in one place.</h1>
        <p className="muted">StrawHats members get the full clan toolkit. Outside buyers can also sign in to use the public Order Exchange without access to private clan data.</p>

        {setupRequired ? (
          <div className="notice danger-note">
            <strong>One setup step remains:</strong> the Cloudflare D1 database schema has not been applied yet.
          </div>
        ) : (
          <div className="stack">
            <a className="primary-button discord-login" href="/api/auth/discord">Sign in with Discord</a>
            <p className="muted">Discord identifies your HAKI Toolkit account. Clan members can verify their Koruxa character for full clan access; outside buyers can use Orders with Discord alone.</p>
          </div>
        )}

        {error && !setupRequired ? <div className="notice">{error}</div> : null}
      </section>
    </div>
  )
}
