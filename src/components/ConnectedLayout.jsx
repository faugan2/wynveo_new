import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import {
  IoHome,
  IoHomeOutline,
  IoGameController,
  IoGameControllerOutline,
  IoFootball,
  IoFootballOutline,
  IoReceipt,
  IoReceiptOutline,
  IoWallet,
  IoWalletOutline,
  IoPerson,
  IoPersonOutline,
  IoTimeOutline,
  IoGiftOutline,
  IoShieldCheckmarkOutline,
  IoHelpCircleOutline,
  IoDocumentTextOutline,
  IoLogOutOutline,
  IoChevronDown,
  IoMenuOutline,
} from 'react-icons/io5';
import { formatFcfa } from '../lib/format.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useHelpInfo } from '../lib/helpInfo.js';
import { useLogoUrl } from '../lib/branding.js';
import { walletFromProfile } from '../lib/wallet.js';
import GuestMenu from './GuestMenu.jsx';
import '../styles/guest-home.css';
import '../styles/connected-theme.css';

// Icônes Ionicons : version contour au repos, version pleine quand l'onglet est actif.
// Barre du bas (téléphone) : même disposition que la page d'accueil visiteur, avec Menu en première case.
const TABS = [
  { to: '/home', label: 'Dashboard', Icon: IoHomeOutline, ActiveIcon: IoHome, inBottomBar: true },
  { to: '/jeux', label: 'Jeux', Icon: IoGameControllerOutline, ActiveIcon: IoGameController, inBottomBar: true },
  { to: '/sport', label: 'Sport', Icon: IoFootballOutline, ActiveIcon: IoFootball, inBottomBar: true },
  { to: '/mes-paris', label: 'Mes Paris', Icon: IoReceiptOutline, ActiveIcon: IoReceipt, inBottomBar: false },
  { to: '/portefeuille', label: 'Portefeuille', Icon: IoWalletOutline, ActiveIcon: IoWallet, inBottomBar: true },
  { to: '/profil', label: 'Profil', Icon: IoPersonOutline, ActiveIcon: IoPerson, inBottomBar: false },
];

// Pages secondaires : menu « Plus... » sur bureau.
const MORE_ITEMS = [
  { to: '/', label: 'Accueil du site', Icon: IoHomeOutline },
  { to: '/historique', label: 'Historique', Icon: IoTimeOutline },
  { to: '/bonus', label: 'Bonus et promotions', Icon: IoGiftOutline },
  { to: '/jeu-responsable', label: 'Jeu responsable', Icon: IoShieldCheckmarkOutline },
  { to: '/aide', label: 'Aide et support', Icon: IoHelpCircleOutline },
  { to: '/conditions', label: "Conditions d'utilisation", Icon: IoDocumentTextOutline },
];

// Liens de navigation de la barre du haut (bureau) : tous les onglets.
function NavTabs({ className, tabs }) {
  return (
    <nav
      className={className}
      aria-label="Navigation principale"
      style={{ gridTemplateColumns: `repeat(${tabs.length}, 1fr)` }}
    >
      {tabs.map(({ to, label, Icon, ActiveIcon }) => (
        <NavLink key={to} to={to} className={({ isActive }) => `nav-link${isActive ? ' is-active' : ''}`}>
          {({ isActive }) => (
            <>
              <span className="nav-icon" aria-hidden="true">
                {isActive ? <ActiveIcon size={22} /> : <Icon size={22} />}
              </span>
              <span className="nav-label">{label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

// Barre du bas (téléphone) : Menu, puis les quatre onglets principaux, avec les mêmes icônes que l'accueil visiteur.
function BottomBar({ menuOpen, onToggleMenu }) {
  const tabs = TABS.filter((tab) => tab.inBottomBar);
  return (
    <nav className="guest-tabbar" aria-label="Navigation rapide">
      <button type="button" className="guest-tab" onClick={onToggleMenu} aria-expanded={menuOpen}>
        <span aria-hidden="true"><IoMenuOutline size={22} /></span>
        <small>Menu</small>
      </button>
      {tabs.map(({ to, label, Icon, ActiveIcon }) => (
        <NavLink key={to} to={to} className={({ isActive }) => `guest-tab${isActive ? ' is-active' : ''}`}>
          {({ isActive }) => (
            <>
              <span aria-hidden="true">{isActive ? <ActiveIcon size={22} /> : <Icon size={22} />}</span>
              <small>{label}</small>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

// Menu « Plus... » (bureau) : pages secondaires et déconnexion.
function MoreMenu() {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);
  const navigate = useNavigate();
  const { signOut } = useAuth();

  // Ferme le menu au clic en dehors, et avec la touche Échap.
  useEffect(() => {
    if (!open) return undefined;
    function handlePointer(event) {
      if (!menuRef.current?.contains(event.target)) setOpen(false);
    }
    function handleKey(event) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  async function handleSignOut() {
    setOpen(false);
    await signOut();
    navigate('/', { replace: true });
  }

  return (
    <div className="more-menu" ref={menuRef}>
      <button type="button" className="more-trigger" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        Plus <IoChevronDown size={14} />
      </button>
      {open && (
        <>
          <ul className="more-panel">
            {MORE_ITEMS.map(({ to, label, Icon }) => (
              <li key={to}>
                <NavLink to={to} className="more-item" onClick={() => setOpen(false)}>
                  <Icon size={18} aria-hidden="true" />
                  <span>{label}</span>
                </NavLink>
              </li>
            ))}
            <li>
              <button type="button" className="more-item more-item--danger" onClick={handleSignOut}>
                <IoLogOutOutline size={18} aria-hidden="true" />
                <span>Se déconnecter</span>
              </button>
            </li>
          </ul>
        </>
      )}
    </div>
  );
}

// Coque des pages connectées : en-tête (logo, navigation et solde), contenu, barre du bas et tiroir de menu (téléphone).
export default function ConnectedLayout({ children }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { profile } = useAuth();
  const { info } = useHelpInfo();
  const logoUrl = useLogoUrl();
  const wallet = walletFromProfile(profile);
  const support = info?.support;

  return (
    <div className={`connected-shell${menuOpen ? ' is-menu-open' : ''}`}>
      <header className="connected-header">
        <Link to="/" className="brand header-brand" style={{ fontSize: 24 }} aria-label="Retour à l'accueil du site">
          {logoUrl ? <img className="brand-logo" src={logoUrl} alt="Wynveo" /> : <>WYN<span>VEO</span></>}
        </Link>
        <NavTabs className="top-nav" tabs={TABS} />
        <MoreMenu />
        <div className="header-actions">
          <div className="balance-pill">Dépôts : {formatFcfa(wallet.deposit)}</div>
        </div>
      </header>

      <main className="app-shell connected">
        <div className="connected-body">{children}</div>
      </main>

      <BottomBar menuOpen={menuOpen} onToggleMenu={() => setMenuOpen((open) => !open)} />

      <div className="guest-overlay" onClick={() => setMenuOpen(false)} aria-hidden="true" />
      <GuestMenu support={support} onClose={() => setMenuOpen(false)} />
    </div>
  );
}
