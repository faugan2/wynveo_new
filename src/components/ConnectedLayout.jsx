import { NavLink } from 'react-router-dom';
import { MOCK_WALLET } from '../mock/wallet.js';
import { formatFcfa } from '../lib/format.js';

const TABS = [
  { to: '/home', label: 'Accueil', icon: '🏠' },
  { to: '/jeux', label: 'Jeux', icon: '🎰' },
  { to: '/sport', label: 'Sport', icon: '⚽' },
  { to: '/mes-paris', label: 'Mes Paris', icon: '🧾' },
  { to: '/portefeuille', label: 'Portefeuille', icon: '👛' },
  { to: '/profil', label: 'Profil', icon: '👤' },
];

// Liens de navigation. Le même jeu de liens sert à la barre du bas (téléphone) et à la barre latérale (bureau).
function NavTabs({ className }) {
  return (
    <nav className={className} aria-label="Navigation principale">
      {TABS.map((tab) => (
        <NavLink key={tab.to} to={tab.to} className={({ isActive }) => `nav-link${isActive ? ' is-active' : ''}`}>
          <span className="nav-icon" aria-hidden="true">{tab.icon}</span>
          <span className="nav-label">{tab.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

// Coque des pages connectées : barre latérale (bureau), en-tête avec le solde, contenu, barre du bas (téléphone).
export default function ConnectedLayout({ children }) {
  const balance = (
    <div className="balance-pill">Solde : {formatFcfa(MOCK_WALLET.balance)}</div>
  );

  return (
    <div className="connected-shell">
      <aside className="side-nav">
        <div className="brand">
          WYN<span>VEO</span>
        </div>
        <NavTabs className="side-tabs" />
        <div className="side-balance">{balance}</div>
      </aside>

      <main className="app-shell connected">
        <header className="connected-header">
          <div className="brand" style={{ fontSize: 24 }}>
            WYN<span>VEO</span>
          </div>
          {balance}
        </header>
        <div className="connected-body">{children}</div>
      </main>

      <NavTabs className="bottom-nav" />
    </div>
  );
}
