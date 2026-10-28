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
        <div className="title-font" style={{ fontSize: 24 }}>
          WYN<span style={{ color: 'var(--yellow)' }}>VEO</span>
        </div>
        <button type="button" className="link" onClick={() => signOut().then(() => navigate('/', { replace: true }))}>
          Se déconnecter
        </button>
      </header>

      <VerificationBanner />

      <p style={{ color: 'var(--text-muted)', marginTop: 16 }}>
        Bonjour{profile?.fullName ? ` ${profile.fullName}` : ''}, que voulez-vous faire ?
      </p>

      <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
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
        </button>
      </section>
    </main>
  );
}
