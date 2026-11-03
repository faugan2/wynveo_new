import { Link, useNavigate } from 'react-router-dom';

// Écran 01 : Bienvenue. Sur bureau, la marque et le texte sont à gauche, les cartes et les boutons à droite.
export default function Welcome() {
  const navigate = useNavigate();

  return (
    <main className="app-shell welcome-layout">
      <header className="welcome-brand">
        <div className="brand">
          WYN<span>VEO</span>
        </div>
      </header>

      <section className="universe-grid welcome-cards">
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

      <section className="welcome-hero">
        <h1 className="hero-title title-font">
          Jeux et paris sportifs,
          <br />
          un seul compte
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 15, margin: '12px 0 0', maxWidth: 360 }}>
          Déposez avec Mobile Money ou crypto, jouez partout, retirez vos gains en quelques minutes.
        </p>
      </section>

      <section className="screen-footer welcome-footer">
        <Link to="/register" className="btn btn-primary">Créer un compte</Link>
        <Link to="/login" className="btn btn-outline">Se connecter</Link>
        <p className="footer-note" style={{ margin: 0 }}>18+ · Jouez de manière responsable</p>
      </section>
    </main>
  );
}
