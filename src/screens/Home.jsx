import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import VerificationBanner from '../components/VerificationBanner.jsx';

// Accueil connecté : choix Jeux ou Sport. Le contenu des univers sera ajouté aux étapes suivantes.
export default function Home() {
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();

  return (
    <main className="app-shell">
      <header className="topbar" style={{ justifyContent: 'space-between' }}>
        <div className="brand" style={{ fontSize: 24 }}>
          WYN<span>VEO</span>
        </div>
        <button type="button" className="link" onClick={() => signOut().then(() => navigate('/', { replace: true }))}>
          Se déconnecter
        </button>
      </header>

      <VerificationBanner />

      <p style={{ color: 'var(--text-muted)', marginTop: 16 }}>
        Bonjour{profile?.fullName ? ` ${profile.fullName}` : ''}, que voulez-vous faire ?
      </p>

      <section className="universe-grid" style={{ marginTop: 12 }}>
        <button type="button" className="universe-card universe-card--jeux" onClick={() => navigate('/univers/jeux')}>
          <span className="icon" aria-hidden="true">🎰</span>
          <span className="name title-font">Jeux</span>
        </button>
        <button type="button" className="universe-card universe-card--sport" onClick={() => navigate('/univers/sport')}>
          <span className="icon" aria-hidden="true">⚽</span>
          <span className="name title-font">Sport</span>
        </button>
      </section>
    </main>
  );
}
