import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  IoArrowBackOutline,
  IoBarChartOutline,
  IoCardOutline,
  IoCloseOutline,
  IoFootballOutline,
  IoGameControllerOutline,
  IoGiftOutline,
  IoHelpCircleOutline,
  IoHomeOutline,
  IoImageOutline,
  IoListOutline,
  IoMenuOutline,
  IoPeopleOutline,
  IoReceiptOutline,
  IoShieldCheckmarkOutline,
  IoSwapHorizontalOutline,
  IoTrophyOutline,
} from 'react-icons/io5';
import { functions } from '../../lib/firebase.js';

// Rubriques de l'administration, regroupées comme la barre latérale du site.
const GROUPS = [
  {
    title: 'Joueurs',
    items: [
      { key: 'utilisateurs', label: 'Utilisateurs', to: '/admin/utilisateurs', Icon: IoPeopleOutline },
      { key: 'transactions', label: 'Transactions', to: '/admin/transactions', Icon: IoSwapHorizontalOutline },
      { key: 'paris', label: 'Paris', to: '/admin/paris', Icon: IoReceiptOutline },
      { key: 'matchs', label: 'Matchs et cotes', to: '/admin/matchs', Icon: IoFootballOutline },
      { key: 'competitions', label: 'Compétitions', to: '/admin/competitions', Icon: IoTrophyOutline },
    ],
  },
  {
    title: 'Finance',
    items: [
      { key: 'paiements', label: 'Paiements', to: '/admin/paiements', Icon: IoCardOutline },
      { key: 'promotions', label: 'Promotions et bonus', to: '/admin/promotions', Icon: IoGiftOutline },
      { key: 'rapports', label: 'Rapports', to: '/admin/rapports', Icon: IoBarChartOutline },
    ],
  },
  {
    title: 'Contenu',
    items: [
      { key: 'accueil', label: 'Accueil visiteur', to: '/admin/accueil', Icon: IoHomeOutline },
      { key: 'logo', label: 'Logo', to: '/admin/logo', Icon: IoImageOutline },
      { key: 'aide', label: 'Aide et contacts', to: '/admin/support', Icon: IoHelpCircleOutline },
    ],
  },
  {
    title: 'Jeux',
    items: [{ key: 'jeux', label: 'Réglages des jeux', to: '/admin/jeux', Icon: IoGameControllerOutline }],
  },
  {
    title: 'Système',
    items: [
      { key: 'admins', label: 'Admins et rôles', to: '/admin/admins', Icon: IoShieldCheckmarkOutline },
      { key: 'journal', label: "Journal d'audit", to: '/admin/journal', Icon: IoListOutline },
    ],
  },
];

const ALL_ITEMS = GROUPS.flatMap((group) => group.items);

// Cadre commun des pages d'administration : barre latérale (tiroir sur téléphone), rôle de l'utilisateur, contrôle d'accès.
export default function AdminShell({ active, children }) {
  const navigate = useNavigate();
  const [role, setRole] = useState(null);
  const [denied, setDenied] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    functions
      .httpsCallable('adminMe')({})
      .then(({ data }) => setRole(data.role))
      .catch(() => {
        setDenied(true);
      });
  }, []);

  // Échap ferme le menu sur téléphone.
  useEffect(() => {
    if (!menuOpen) return undefined;
    function onKey(event) {
      if (event.key === 'Escape') setMenuOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  return (
    <div className={`admin-app${menuOpen ? ' is-menu-open' : ''}`}>
      <aside className="admin-sidebar" aria-label="Menu d'administration">
        <div className="admin-brand">
          WYN<span>VEO</span>
          <small>Administration</small>
        </div>

        {GROUPS.map((group) => (
          <section key={group.title} className="admin-group">
            <h2>{group.title}</h2>
            <nav className="admin-nav" aria-label={group.title}>
              {group.items.map(({ key, label, to, Icon }) => (
                <Link
                  key={key}
                  to={to}
                  className={key === active ? 'is-active' : ''}
                  aria-current={key === active ? 'page' : undefined}
                  onClick={() => setMenuOpen(false)}
                >
                  <Icon aria-hidden="true" />
                  <span>{label}</span>
                </Link>
              ))}
            </nav>
          </section>
        ))}

        <button
          type="button"
          className="admin-back"
          onClick={() => {
            setMenuOpen(false);
            navigate('/home');
          }}
        >
          <IoArrowBackOutline aria-hidden="true" />
          <span>Retour à l'application</span>
        </button>
      </aside>

      {menuOpen && <button type="button" className="admin-overlay" aria-label="Fermer le menu" onClick={() => setMenuOpen(false)} />}

      <main className="admin-main">
        <header className="admin-topbar">
          <button
            type="button"
            className="admin-menu-button"
            aria-label={menuOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <IoCloseOutline size={22} aria-hidden="true" /> : <IoMenuOutline size={22} aria-hidden="true" />}
          </button>
          <h1>{ALL_ITEMS.find((item) => item.key === active)?.label}</h1>
          {role && <span className="admin-role">{role}</span>}
        </header>
        {denied && <p className="admin-denied" role="alert">Accès refusé. Ce compte n'est pas administrateur.</p>}
        {!denied && role && children}
        {!denied && !role && <p className="admin-hint">Vérification des droits…</p>}
      </main>
    </div>
  );
}
