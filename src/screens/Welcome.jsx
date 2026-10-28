import { Link, useNavigate } from 'react-router-dom';

// Écran 01 : Bienvenue.
export default function Welcome() {
  const navigate = useNavigate();

  return (
    <main className="app-shell" style={{ justifyContent: 'space-between', paddingBottom: 24 }}>
      <header style={{ textAlign: 'center', paddingTop: 36 }}>
        <div className="title-font" style={{ fontSize: 40 }}>
          WYN<span style={{ color: 'var(--yellow)' }}>VEO</span>
        </div>
      </header>

      <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 28 }}>
        <button
          type="button"
          onClick={() => navigate('/univers/jeux')}
          style={{
            background: 'linear-gradient(160deg, #8b5cf6 0%, var(--purple) 100%)',
            border: 0,
            borderRadius: 18,
            padding: 16,
            textAlign: 'left',
            color: 'var(--text)',
            cursor: 'pointer',
            minHeight: 170,
          }}
        >
          <div style={{ fontSize: 44 }} aria-hidden="true">🎰</div>
          <div className="title-font" style={{ fontSize: 24, marginTop: 8 }}>Jeux</div>
          <div style={{ fontSize: 13, opacity: 0.85 }}>Spin, Box, Jackpot…</div>
        </button>
        <button
          type="button"
          onClick={() => navigate('/univers/sport')}
          style={{
            background: 'linear-gradient(160deg, #14b8a6 0%, var(--teal) 100%)',
            border: 0,
            borderRadius: 18,
            padding: 16,
            textAlign: 'left',
            color: 'var(--text)',
            cursor: 'pointer',
            minHeight: 170,
          }}
        >
          <div style={{ fontSize: 44 }} aria-hidden="true">⚽</div>
          <div className="title-font" style={{ fontSize: 24, marginTop: 8 }}>Sport</div>
          <div style={{ fontSize: 13, opacity: 0.85 }}>Foot, basket, live</div>
        </button>
      </section>

      <section style={{ textAlign: 'center', marginTop: 32 }}>
        <h1 className="title-font" style={{ fontSize: 34, margin: 0, lineHeight: 1.05 }}>
          Jeux et paris sportifs,
          <br />
          un seul compte
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 15, margin: '12px auto 0', maxWidth: 340 }}>
          Déposez une fois avec T-Money ou Flooz, jouez partout, retirez vos gains en quelques minutes.
        </p>
      </section>

      <section style={{ marginTop: 'auto', paddingTop: 32 }}>
        <Link to="/register" className="btn btn-primary">Créer un compte</Link>
        <Link to="/login" className="btn btn-outline" style={{ marginTop: 12 }}>Se connecter</Link>
        <p className="footer-note">18+ · Jouez de manière responsable</p>
      </section>
    </main>
  );
}
