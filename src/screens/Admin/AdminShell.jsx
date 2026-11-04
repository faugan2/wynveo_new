import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { functions } from '../../lib/firebase.js';

const NAV = [
  { key: 'utilisateurs', label: 'Utilisateurs', to: '/admin/utilisateurs' },
  { key: 'transactions', label: 'Transactions', to: '/admin/transactions' },
  { key: 'paiements', label: 'Paiements', to: '/admin/paiements' },
  { key: 'jeux', label: 'Jeux', to: '/admin/jeux' },
  { key: 'journal', label: "Journal d'audit", to: '/admin/journal' },
];

// Cadre commun des pages d'administration : barre latérale, rôle de l'utilisateur, contrôle d'accès.
export default function AdminShell({ active, children }) {
  const navigate = useNavigate();
  const [role, setRole] = useState(null);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    functions
      .httpsCallable('adminMe')({})
      .then(({ data }) => setRole(data.role))
      .catch(() => {
        setDenied(true);
      });
  }, []);

  return (
    <div className="admin-app">
      <aside className="admin-sidebar">
        <div className="admin-brand">
          WYNVEO <small>Administration</small>
        </div>
        <nav className="admin-nav" aria-label="Administration">
          {NAV.map((item) => (
            <Link key={item.key} to={item.to} className={item.key === active ? 'is-active' : ''}>
              {item.label}
            </Link>
          ))}
        </nav>
        <button type="button" className="admin-back" onClick={() => navigate('/home')}>
          Retour à l'application
        </button>
      </aside>

      <main className="admin-main">
        <header className="admin-topbar">
          <h1>{NAV.find((item) => item.key === active)?.label}</h1>
          {role && <span className="admin-role">{role}</span>}
        </header>
        {denied && <p className="admin-denied" role="alert">Accès refusé. Ce compte n'est pas administrateur.</p>}
        {!denied && role && children}
        {!denied && !role && <p className="admin-hint">Vérification des droits…</p>}
      </main>
    </div>
  );
}
