import { NavLink } from 'react-router-dom';
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
} from 'react-icons/io5';
import { MOCK_WALLET } from '../mock/wallet.js';
import { formatFcfa } from '../lib/format.js';

// Icônes Ionicons : version contour au repos, version pleine quand l'onglet est actif.
const TABS = [
  { to: '/home', label: 'Accueil', Icon: IoHomeOutline, ActiveIcon: IoHome },
  { to: '/jeux', label: 'Jeux', Icon: IoGameControllerOutline, ActiveIcon: IoGameController },
  { to: '/sport', label: 'Sport', Icon: IoFootballOutline, ActiveIcon: IoFootball },
  { to: '/mes-paris', label: 'Mes Paris', Icon: IoReceiptOutline, ActiveIcon: IoReceipt },
  { to: '/portefeuille', label: 'Portefeuille', Icon: IoWalletOutline, ActiveIcon: IoWallet },
  { to: '/profil', label: 'Profil', Icon: IoPersonOutline, ActiveIcon: IoPerson },
];

// Liens de navigation. Le même jeu sert à la barre du haut (bureau) et à la barre du bas (téléphone).
function NavTabs({ className }) {
  return (
    <nav className={className} aria-label="Navigation principale">
      {TABS.map(({ to, label, Icon, ActiveIcon }) => (
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

// Coque des pages connectées : en-tête (logo, navigation sur bureau, solde), contenu, barre du bas (téléphone).
export default function ConnectedLayout({ children }) {
  return (
    <div className="connected-shell">
      <header className="connected-header">
        <div className="brand" style={{ fontSize: 24 }}>
          WYN<span>VEO</span>
        </div>
        <NavTabs className="top-nav" />
        <div className="balance-pill">Solde : {formatFcfa(MOCK_WALLET.balance)}</div>
      </header>

      <main className="app-shell connected">
        <div className="connected-body">{children}</div>
      </main>

      <NavTabs className="bottom-nav" />
    </div>
  );
}
