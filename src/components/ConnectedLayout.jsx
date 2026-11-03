import { NavLink } from 'react-router-dom';
import { MOCK_WALLET } from '../mock/wallet.js';

const TABS = [
  { to: '/home', label: 'Accueil', icon: '⌂' },
  { to: '/jeux', label: 'Jeux', icon: '🎮' },
  { to: '/sport', label: 'Sport', icon: '⚽' },
  { to: '/mes-paris', label: 'Mes Paris', icon: '🧾' },
  { to: '/portefeuille', label: 'Portef.', icon: '👛' },
  { to: '/profil', label: 'Profil', icon: '👤' },
];

// En-tête (logo et solde) et onglets, pour toutes les pages connectées.
export default function ConnectedLayout({ children }) {
  return (
    <main className="app-shell connected">
      <header className="connected-header">
        <div className="brand" style={{ fontSize: 24 }}>
          WYN<span>VEO</span>
        </div>
        <div className="balance-pill">Solde : {MOCK_WALLET.balance.toLocaleString('fr-FR')} FCFA</div>
      </header>

      <nav className="tabs" aria-label="Navigation principale">
        {TABS.map((tab) => (
          <NavLink key={tab.to} to={tab.to} className={({ isActive }) => `tab${isActive ? ' is-active' : ''}`}>
            <span aria-hidden="true">{tab.icon}</span>
            <span>{tab.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="connected-body">{children}</div>
    </main>
  );
}
