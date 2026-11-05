import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useHelpInfo } from '../lib/helpInfo.js';
import GuestMenu from './GuestMenu.jsx';
import {
  IoFootballOutline,
  IoGameControllerOutline,
  IoHome,
  IoHomeOutline,
  IoMenuOutline,
  IoWalletOutline,
} from 'react-icons/io5';
import '../styles/guest-home.css';

// Coque des pages visiteur (accueil, univers Jeux et Sport) : en-tête, tiroir de menu, contenu, pied de page et barre du bas.
// `active` indique la rubrique en cours : 'home' | 'jeux' | 'sport' (ou null).
export default function GuestLayout({ active = null, children }) {
  const { user } = useAuth();
  const { info } = useHelpInfo();
  const support = info?.support;
  const [menuOpen, setMenuOpen] = useState(false);
  // Pour un visiteur, les liens d'aide passent par la connexion ; pour un compte connecté, ils vont directement à la page.
  const authTo = (path) => (user ? path : '/login');
  const current = (key) => (active === key ? ' is-active' : '');

  return (
    <div className={`guest-home${menuOpen ? ' is-menu-open' : ''}`}>
      <header className="guest-topbar">
        <Link to="/" className="guest-brand" aria-label="Wynveo, accueil">
          WYN<span>VEO</span>
        </Link>
        <nav className="guest-nav" aria-label="Rubriques">
          <Link to="/" className={current('home').trim()}>Accueil</Link>
          <Link to="/univers/jeux" className={current('jeux').trim()}>Jeux</Link>
          <Link to="/univers/sport" className={current('sport').trim()}>Sport</Link>
        </nav>
        <div className="guest-actions">
          {user ? (
            <Link to="/home" className="guest-btn guest-btn--primary">Mon espace</Link>
          ) : (
            <>
              <Link to="/login" className="guest-btn guest-btn--ghost">Connexion</Link>
              <Link to="/register" className="guest-btn guest-btn--primary">Inscription</Link>
            </>
          )}
        </div>
      </header>

      <div className="guest-body">
        <GuestMenu support={support} onClose={() => setMenuOpen(false)} />

        <main className="guest-main">
          {children}

          <footer className="guest-footer">
            <div className="guest-footer-cards">
              <Link to={user ? '/home' : '/register'} className="guest-footer-card">
                <span>
                  <strong>Bonus de bienvenue</strong>
                  <small>Versé à votre premier dépôt confirmé</small>
                </span>
                <span className="guest-footer-card-btn">{user ? 'Mon espace' : 'Créer un compte'}</span>
              </Link>
              <div className="guest-footer-card">
                <span>
                  <strong>Jeu responsable</strong>
                  <small>Jouez avec mesure. Les jeux comportent un risque de perte.</small>
                </span>
                <Link to={authTo('/jeu-responsable')} className="guest-footer-card-btn">{user ? 'Lire' : 'Se connecter'}</Link>
              </div>
              <div className="guest-footer-card">
                <span>
                  <strong>Assistance</strong>
                  <small>{support?.hours || 'Nous répondons à vos questions'}</small>
                </span>
                <Link to={authTo('/aide')} className="guest-footer-card-btn">Nous écrire</Link>
              </div>
            </div>

            <div className="guest-footer-cols">
              <div>
                <h3>Informations</h3>
                <Link to={authTo('/aide')}>Aide et support</Link>
                <Link to={authTo('/jeu-responsable')}>Jeu responsable</Link>
                <Link to={authTo('/conditions')}>Conditions d'utilisation</Link>
              </div>
              <div>
                <h3>Catégories</h3>
                <Link to="/univers/jeux">Jeux</Link>
                <Link to="/univers/sport">Sport</Link>
                <Link to="/register">Bonus</Link>
              </div>
              {support && (support.email || support.whatsapp || support.helpline) && (
                <div>
                  <h3>Contact</h3>
                  {support.email && <a href={`mailto:${support.email}`}>{support.email}</a>}
                  {support.whatsapp && <span>WhatsApp : {support.whatsapp}</span>}
                  {support.helpline && <span>Ligne d'aide : {support.helpline}</span>}
                </div>
              )}
            </div>

            <p className="guest-footer-legal">
              © {new Date().getFullYear()} Wynveo · 18+ · Jouez de manière responsable. Les jeux et les paris comportent un risque de perte.
            </p>
          </footer>
        </main>
      </div>

      <div className="guest-overlay" onClick={() => setMenuOpen(false)} aria-hidden="true" />
      <nav className="guest-tabbar" aria-label="Navigation rapide">
        <button type="button" className="guest-tab" onClick={() => setMenuOpen((open) => !open)} aria-expanded={menuOpen}>
          <span aria-hidden="true"><IoMenuOutline size={22} /></span>
          <small>Menu</small>
        </button>
        <Link to="/" className={`guest-tab${current('home')}`} aria-current={active === 'home' ? 'page' : undefined}>
          <span aria-hidden="true">{active === 'home' ? <IoHome size={22} /> : <IoHomeOutline size={22} />}</span>
          <small>Accueil</small>
        </Link>
        <Link to="/univers/jeux" className={`guest-tab${current('jeux')}`} aria-current={active === 'jeux' ? 'page' : undefined}>
          <span aria-hidden="true"><IoGameControllerOutline size={22} /></span>
          <small>Jeux</small>
        </Link>
        <Link to="/univers/sport" className={`guest-tab${current('sport')}`} aria-current={active === 'sport' ? 'page' : undefined}>
          <span aria-hidden="true"><IoFootballOutline size={22} /></span>
          <small>Sport</small>
        </Link>
        <Link to="/login" className="guest-tab">
          <span aria-hidden="true"><IoWalletOutline size={22} /></span>
          <small>Compte</small>
        </Link>
      </nav>
    </div>
  );
}
