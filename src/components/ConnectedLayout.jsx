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
  IoMenuOutline,
  IoTimeOutline,
  IoGiftOutline,
  IoShieldCheckmarkOutline,
  IoHelpCircleOutline,
  IoDocumentTextOutline,
  IoLogOutOutline,
  IoChevronForward,
  IoChevronDown,
} from 'react-icons/io5';
import { formatFcfa } from '../lib/format.js';
import { useAuth } from '../context/AuthContext.jsx';
import { walletFromProfile } from '../lib/wallet.js';
import BottomSheet from './BottomSheet.jsx';

// Icônes Ionicons : version contour au repos, version pleine quand l'onglet est actif.
// `inBottomBar` : onglet affiché dans la barre du bas sur téléphone (les autres vont dans le menu).
const TABS = [
  { to: '/home', label: 'Accueil', Icon: IoHomeOutline, ActiveIcon: IoHome, inBottomBar: true },
  { to: '/jeux', label: 'Jeux', Icon: IoGameControllerOutline, ActiveIcon: IoGameController, inBottomBar: true },
  { to: '/sport', label: 'Sport', Icon: IoFootballOutline, ActiveIcon: IoFootball, inBottomBar: true },
  { to: '/mes-paris', label: 'Mes Paris', Icon: IoReceiptOutline, ActiveIcon: IoReceipt, inBottomBar: false },
  { to: '/portefeuille', label: 'Portefeuille', Icon: IoWalletOutline, ActiveIcon: IoWallet, inBottomBar: true },
  { to: '/profil', label: 'Profil', Icon: IoPersonOutline, ActiveIcon: IoPerson, inBottomBar: false },
];

// Pages secondaires : menu « Plus... » sur bureau, rangées dans le menu hamburger sur téléphone.
const MORE_ITEMS = [
  { to: '/historique', label: 'Historique', Icon: IoTimeOutline },
  { to: '/bonus', label: 'Bonus et promotions', Icon: IoGiftOutline },
  { to: '/jeu-responsable', label: 'Jeu responsable', Icon: IoShieldCheckmarkOutline },
  { to: '/aide', label: 'Aide et support', Icon: IoHelpCircleOutline },
  { to: '/conditions', label: "Conditions d'utilisation", Icon: IoDocumentTextOutline },
];

// Éléments du menu hamburger (téléphone) : Mes Paris et Profil, puis les pages secondaires.
const MENU_ITEMS = [
  { to: '/mes-paris', label: 'Mes Paris', Icon: IoReceiptOutline },
  { to: '/profil', label: 'Profil', Icon: IoPersonOutline },
  ...MORE_ITEMS,
];

// Liens de navigation. La barre du haut (bureau) affiche tous les onglets ;
// la barre du bas (téléphone) n'affiche que ceux marqués `inBottomBar`.
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

// Menu hamburger (téléphone) : éléments secondaires et déconnexion.
function MainMenu({ open, onClose }) {
  const navigate = useNavigate();
  const { signOut } = useAuth();

  async function handleSignOut() {
    onClose();
    await signOut();
    navigate('/', { replace: true });
  }

  return (
    <BottomSheet open={open} title="Menu" onClose={onClose}>
      <ul className="menu-list">
        {MENU_ITEMS.map(({ to, label, Icon }) => (
          <li key={to}>
            <NavLink to={to} className="menu-item" onClick={onClose}>
              <span className="menu-item-icon" aria-hidden="true"><Icon size={20} /></span>
              <span className="menu-item-label">{label}</span>
              <span className="menu-item-arrow" aria-hidden="true"><IoChevronForward size={16} /></span>
            </NavLink>
          </li>
        ))}
        <li>
          <button type="button" className="menu-item menu-item--danger" onClick={handleSignOut}>
            <span className="menu-item-icon" aria-hidden="true"><IoLogOutOutline size={20} /></span>
            <span className="menu-item-label">Se déconnecter</span>
          </button>
        </li>
      </ul>
    </BottomSheet>
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

// Coque des pages connectées : en-tête (logo, navigation sur bureau, solde et menu sur téléphone), contenu, barre du bas (téléphone).
export default function ConnectedLayout({ children }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { profile } = useAuth();
  const wallet = walletFromProfile(profile);

  return (
    <div className="connected-shell">
      <header className="connected-header">
        <Link to="/home" className="brand header-brand" style={{ fontSize: 24 }} aria-label="Retour à l'accueil">
          WYN<span>VEO</span>
        </Link>
        <NavTabs className="top-nav" tabs={TABS} />
        <MoreMenu />
        <div className="header-actions">
          <div className="balance-pill">Dépôts : {formatFcfa(wallet.deposit)}</div>
          <button
            type="button"
            className="menu-button"
            onClick={() => setMenuOpen(true)}
            aria-label="Ouvrir le menu"
            aria-expanded={menuOpen}
          >
            <IoMenuOutline size={24} />
          </button>
        </div>
      </header>

      <main className="app-shell connected">
        <div className="connected-body">{children}</div>
      </main>

      <NavTabs className="bottom-nav" tabs={TABS.filter((tab) => tab.inBottomBar)} />

      <MainMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
    </div>
  );
}
