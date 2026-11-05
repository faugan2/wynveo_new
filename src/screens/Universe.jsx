import { Link, Navigate, useParams } from 'react-router-dom';
import { UNIVERSES } from '../content/universes.js';
import { useAuth } from '../context/AuthContext.jsx';
import GuestLayout from '../components/GuestLayout.jsx';
import '../styles/guest-home.css';
import '../styles/univers.css';

// Présentation d'un univers (Jeux ou Sport), accessible avant connexion. Même coque que l'accueil visiteur.
export default function Universe() {
  const { name } = useParams();
  const { user } = useAuth();
  const universe = UNIVERSES[name];

  if (!universe) {
    return <Navigate to="/" replace />;
  }

  return (
    <GuestLayout active={name}>
      <section className="guest-section">
        <div className="guest-section-head">
          <h1 className="guest-section-title guest-univers-title">{universe.title}</h1>
        </div>
        <p className="guest-univers-tagline">{universe.tagline}</p>
      </section>

      {universe.games.length > 0 && (
        <section className="guest-section" aria-label={universe.title}>
          <ul className="guest-univers-list">
            {universe.games.map((game) => (
              <li key={game.name} className={`guest-univers-card${game.soon ? ' is-soon' : ''}`}>
                <span className="guest-univers-icon" aria-hidden="true"><game.icon size={28} /></span>
                <span className="guest-univers-body">
                  <strong>{game.name}</strong>
                  <small>{game.text}</small>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {universe.steps.length > 0 && (
        <section className="guest-section">
          <div className="guest-section-head">
            <h2 className="guest-section-title">Comment ça marche</h2>
          </div>
          <ol className="guest-univers-steps">
            {universe.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </section>
      )}

      <section className="guest-section guest-univers-cta">
        {user ? (
          <Link to={name === 'sport' ? '/sport' : '/jeux'} className="guest-btn guest-btn--primary guest-btn--large">
            {name === 'sport' ? 'Voir les matchs' : 'Voir les jeux'}
          </Link>
        ) : (
          <>
            <Link to="/register" className="guest-btn guest-btn--primary guest-btn--large">Créer un compte</Link>
            <Link to="/login" className="guest-btn guest-btn--ghost guest-btn--large">Se connecter</Link>
          </>
        )}
        <p className="guest-univers-note">18+ · {universe.footerNote}</p>
      </section>
    </GuestLayout>
  );
}
