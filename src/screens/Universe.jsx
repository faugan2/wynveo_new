import { useNavigate, useParams } from 'react-router-dom';

// Présentation d'un univers (Jeux ou Sport), accessible avant connexion.
// Le contenu définitif sera fourni par une maquette à part.
const UNIVERSES = {
  jeux: { title: 'Jeux', text: 'Spin, Box, Lucky Number, Jackpot et Crash.' },
  sport: { title: 'Sport', text: 'Football, basket et tennis, avec des cotes en direct.' },
};

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
      <p style={{ color: 'var(--text-muted)' }}>{universe.text}</p>
      <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Présentation complète à venir.</p>
      <div style={{ marginTop: 'auto', paddingBottom: 24, display: 'grid', gap: 12 }}>
        <button type="button" className="btn btn-primary" onClick={() => navigate('/register')}>
          Créer un compte
        </button>
        <button type="button" className="btn btn-outline" onClick={() => navigate('/login')}>
          Se connecter
        </button>
      </div>
    </main>
  );
}
