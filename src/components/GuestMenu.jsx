import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { FaTelegramPlane } from 'react-icons/fa';
import { telegramLink } from '../lib/helpInfo.js';
import {
  IoChatbubbleEllipsesOutline,
  IoChevronDown,
  IoChevronForward,
  IoClose,
  IoDocumentTextOutline,
  IoGameControllerOutline,
  IoGiftOutline,
  IoHelpCircleOutline,
  IoLogOutOutline,
  IoLogoWhatsapp,
  IoMailOutline,
  IoPersonCircleOutline,
  IoPersonOutline,
  IoShieldCheckmarkOutline,
  IoFootballOutline,
  IoTimeOutline,
} from 'react-icons/io5';

// Menu commun aux visiteurs (page /) et aux comptes connectés (page /home) : tiroir sur mobile, colonne sur ordinateur.
// Les contacts viennent des réglages de l'admin. Les liens changent selon que l'utilisateur est connecté.
const VISITOR_GAMES = [
  { label: 'Lucky Spin', to: '/register' },
  { label: 'Mystery Box', to: '/register' },
  { label: 'Lucky Number', to: '/register' },
  { label: 'Jackpot', to: '/register' },
  { label: 'Crash', to: '/register' },
];

const MEMBER_GAMES = [{ label: 'Tous les jeux', to: '/jeux' }];

const VISITOR_SPORT = [
  { label: 'Football', to: '/register' },
  { label: 'Voir les matchs', to: '/univers/sport' },
];

const MEMBER_SPORT = [
  { label: 'Voir les matchs', to: '/sport' },
  { label: 'Mes paris', to: '/mes-paris' },
];

// Liens à plat sous les rubriques. `separated` ajoute un trait au-dessus.
const VISITOR_ITEMS = [
  { to: '/register', label: 'Bonus et promotions', Icon: IoGiftOutline },
  { to: '/login', label: 'Aide et support', Icon: IoHelpCircleOutline, separated: true },
  { to: '/login', label: 'Jeu responsable', Icon: IoShieldCheckmarkOutline },
];

const MEMBER_ITEMS = [
  { to: '/bonus', label: 'Bonus et promotions', Icon: IoGiftOutline },
  { to: '/historique', label: 'Historique', Icon: IoTimeOutline },
  { to: '/profil', label: 'Profil', Icon: IoPersonOutline },
  { to: '/aide', label: 'Aide et support', Icon: IoHelpCircleOutline, separated: true },
  { to: '/jeu-responsable', label: 'Jeu responsable', Icon: IoShieldCheckmarkOutline },
  { to: '/conditions', label: "Conditions d'utilisation", Icon: IoDocumentTextOutline },
];

export default function GuestMenu({ support, onClose }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [openGroup, setOpenGroup] = useState(null); // 'games' | 'sport' | null
  const whatsapp = support?.whatsapp ? support.whatsapp.replace(/\D/g, '') : '';
  const telegram = telegramLink(support?.telegram);
  const toggle = (group) => setOpenGroup((current) => (current === group ? null : group));

  const gameLinks = user ? MEMBER_GAMES : VISITOR_GAMES;
  const sportLinks = user ? MEMBER_SPORT : VISITOR_SPORT;
  const items = user ? MEMBER_ITEMS : VISITOR_ITEMS;
  const bonusTo = user ? '/bonus' : '/register';

  async function handleSignOut() {
    onClose();
    await signOut();
    navigate('/', { replace: true });
  }

  return (
    <aside className="guest-sidebar" aria-label="Menu">
      <div className="guest-menu-scroll">
        <div className="guest-menu-head">
          <Link to={user ? '/home' : '/login'} className="guest-menu-login" onClick={onClose}>
            <IoPersonCircleOutline className="guest-menu-avatar" aria-hidden="true" />
            <span>{user ? 'Mon espace' : 'Se connecter'}</span>
            <IoChevronForward className="guest-menu-arrow" aria-hidden="true" />
          </Link>
          <button type="button" className="guest-sidebar-close" aria-label="Fermer le menu" onClick={onClose}>
            <IoClose aria-hidden="true" />
          </button>
        </div>

        <nav className="guest-menu-list" aria-label="Rubriques">
          <div className="guest-menu-group">
            <button
              type="button"
              className="guest-menu-item"
              aria-expanded={openGroup === 'games'}
              onClick={() => toggle('games')}
            >
              <IoGameControllerOutline className="guest-menu-icon" aria-hidden="true" />
              <span>Jeux</span>
              <IoChevronDown className={`guest-menu-chevron${openGroup === 'games' ? ' is-open' : ''}`} aria-hidden="true" />
            </button>
            {openGroup === 'games' && (
              <ul className="guest-menu-sub">
                {gameLinks.map((game) => (
                  <li key={game.label}>
                    <Link to={game.to} onClick={onClose}>{game.label}</Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="guest-menu-group">
            <button
              type="button"
              className="guest-menu-item"
              aria-expanded={openGroup === 'sport'}
              onClick={() => toggle('sport')}
            >
              <IoFootballOutline className="guest-menu-icon" aria-hidden="true" />
              <span>Sport</span>
              <IoChevronDown className={`guest-menu-chevron${openGroup === 'sport' ? ' is-open' : ''}`} aria-hidden="true" />
            </button>
            {openGroup === 'sport' && (
              <ul className="guest-menu-sub">
                {sportLinks.map((link) => (
                  <li key={link.label}>
                    <Link to={link.to} onClick={onClose}>{link.label}</Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {items.map(({ to, label, Icon, separated }) => (
            <Link
              key={label}
              to={to}
              className={`guest-menu-item${separated ? ' is-separated' : ''}`}
              onClick={onClose}
            >
              <Icon className="guest-menu-icon" aria-hidden="true" />
              <span>{label}</span>
              <IoChevronForward className="guest-menu-chevron" aria-hidden="true" />
            </Link>
          ))}

          {user && (
            <button type="button" className="guest-menu-item is-separated" onClick={handleSignOut}>
              <IoLogOutOutline className="guest-menu-icon" aria-hidden="true" />
              <span>Se déconnecter</span>
            </button>
          )}
        </nav>
      </div>

      <div className="guest-menu-foot">
        <Link to={bonusTo} className="guest-menu-promo" onClick={onClose}>
          <span className="guest-menu-promo-title">Bonus de bienvenue</span>
          <span className="guest-menu-promo-text">Versé à votre premier dépôt confirmé</span>
          <IoGiftOutline className="guest-menu-promo-icon" aria-hidden="true" />
        </Link>
        {(support?.email || whatsapp || telegram) && (
          <div className="guest-menu-social">
            {support?.email && (
              <a href={`mailto:${support.email}`} aria-label="Écrire au support">
                <IoMailOutline aria-hidden="true" />
              </a>
            )}
            {whatsapp && (
              <a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noreferrer" aria-label="WhatsApp du support">
                <IoLogoWhatsapp aria-hidden="true" />
              </a>
            )}
            {telegram && (
              <a href={telegram.url} target="_blank" rel="noreferrer" aria-label="Telegram du support">
                <FaTelegramPlane aria-hidden="true" />
              </a>
            )}
          </div>
        )}
        <Link to={user ? '/aide' : '/login'} className="guest-menu-support" onClick={onClose}>
          <IoChatbubbleEllipsesOutline aria-hidden="true" />
          <span>Aide et support</span>
        </Link>
      </div>
    </aside>
  );
}
