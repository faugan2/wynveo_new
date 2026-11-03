import { useNavigate, useParams } from 'react-router-dom';
import { UNIVERSES } from '../content/universes.js';

// Présentation d'un univers (Jeux ou Sport), accessible avant connexion.
export default function Universe() {
  const { name } = useParams();
  const navigate = useNavigate();
  const universe = UNIVERSES[name];

  if (!universe) {
    navigate('/', { replace: true });
    return null;
  }

  return (
    <main className="app-shell">
      <div className="topbar">
        <button type="button" className="back-button" onClick={() => navigate(-1)} aria-label="Retour">
          ‹
        </button>
        <h1 className="title-font" style={{ fontSize: 26, margin: 0 }}>{universe.title}</h1>
      </div>

      <p style={{ color: 'var(--text-muted)', marginTop: 4 }}>{universe.tagline}</p>

      {universe.games.length > 0 && (
        <section className="game-list" style={{ display: 'grid', gap: 10, marginTop: 16 }}>
          {universe.games.map((game) => (
            <article
              key={game.name}
              style={{
                display: 'flex',
                gap: 14,
                alignItems: 'center',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 16,
                padding: 14,
                opacity: game.soon ? 0.6 : 1,
              }}
            >
              <span aria-hidden="true" style={{ fontSize: 32 }}>{game.icon}</span>
              <div>
                <h2 className="title-font" style={{ fontSize: 19, margin: 0 }}>{game.name}</h2>
                <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: '4px 0 0' }}>{game.text}</p>
              </div>
            </article>
          ))}
        </section>
      )}

      {universe.steps.length > 0 && (
        <section style={{ marginTop: 20 }}>
          <h2 className="title-font" style={{ fontSize: 18, margin: '0 0 8px' }}>Comment ça marche</h2>
          <ol style={{ margin: 0, paddingLeft: 20, color: 'var(--text-muted)', fontSize: 14, lineHeight: 1.6 }}>
            {universe.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </section>
      )}

      <section className="screen-footer">
        <button type="button" className="btn btn-primary" onClick={() => navigate('/register')}>
          Créer un compte
        </button>
        <button type="button" className="btn btn-outline" onClick={() => navigate('/login')}>
          Se connecter
        </button>
        <p className="footer-note" style={{ margin: 0 }}>
          18+ · {universe.footerNote}
        </p>
      </section>
    </main>
  );
}
