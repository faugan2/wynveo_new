import { Link, useNavigate } from 'react-router-dom';

// Écran 01 : Bienvenue.
export default function Welcome() {
  const navigate = useNavigate();

  return (
    <main className="app-shell">
      <header style={{ textAlign: 'center', paddingTop: 36 }}>
        <div className="brand">
          WYN<span>VEO</span>
        </div>
      </header>

      <section className="universe-grid" style={{ marginTop: 28 }}>
        <button type="button" className="universe-card universe-card--jeux" onClick={() => navigate('/univers/jeux')}>
          <span className="icon" aria-hidden="true">🎰</span>
          <span className="name title-font">Jeux</span>
          <span className="desc">Spin, Box, Jackpot…</span>
        </button>
        <button type="button" className="universe-card universe-card--sport" onClick={() => navigate('/univers/sport')}>
          <span className="icon" aria-hidden="true">⚽</span>
          <span className="name title-font">Sport</span>
          <span className="desc">Foot, basket, live</span>
        </button>
      </section>

      <section style={{ textAlign: 'center', marginTop: 32 }}>
        <h1 className="hero-title title-font">
          Jeux et paris sportifs,
          <br />
          un seul compte
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 15, margin: '12px auto 0', maxWidth: 340 }}>
          Déposez avec Mobile Money ou crypto, jouez partout, retirez vos gains en quelques minutes.
        </p>
      </section>

      <section className="screen-footer">
        <Link to="/register" className="btn btn-primary">Créer un compte</Link>
        <Link to="/login" className="btn btn-outline">Se connecter</Link>
        <p className="footer-note" style={{ margin: 0 }}>18+ · Jouez de manière responsable</p>
      </section>
    </main>
  );
}
