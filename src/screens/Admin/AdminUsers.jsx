import { useState } from 'react';
import { Link } from 'react-router-dom';
import AdminShell from './AdminShell.jsx';
import TablePager from '../../components/Admin/TablePager.jsx';
import { useCursorPaging } from '../../lib/adminPaging.js';
import { functions } from '../../lib/firebase.js';
import { formatFcfa } from '../../lib/format.js';

// Liste des joueurs, par pages de 20. Recherche exacte par numéro ou e-mail (côté serveur), filtre sur la vérification.
export default function AdminUsers() {
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');
  const [verified, setVerified] = useState('');

  const resetKey = `${search}|${verified}`;
  const paging = useCursorPaging(
    (cursor) =>
      functions
        .httpsCallable('adminListUsers')({ search, verified, cursor, pageSize: 20 })
        .then(({ data }) => ({ items: data.users, next: data.next })),
    resetKey
  );
  const { items: users, error } = paging;

  function handleSubmit(event) {
    event.preventDefault();
    setSearch(input.trim());
  }

  return (
    <AdminShell active="utilisateurs">
      <section className="admin-card">
        <form className="admin-search" onSubmit={handleSubmit}>
          <input
            type="search"
            placeholder="Numéro ou e-mail exact"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            aria-label="Rechercher un joueur"
          />
          <button type="submit" className="admin-primary">Rechercher</button>
        </form>

        <div className="admin-filters">
          <label>
            Vérifié
            <select value={verified} onChange={(e) => setVerified(e.target.value)}>
              <option value="">Tous</option>
              <option value="oui">Oui</option>
              <option value="non">Non</option>
            </select>
          </label>
        </div>

        {!users && !error && <p className="admin-hint">Chargement…</p>}
        {users && users.length === 0 && <p className="admin-hint">Aucun joueur trouvé.</p>}
        {users && users.length > 0 && (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Joueur</th>
                  <th>Téléphone</th>
                  <th>Solde réel</th>
                  <th>Bonus</th>
                  <th>Vérifié</th>
                  <th>Inscrit le</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.uid}>
                    <td>
                      <Link to={`/admin/utilisateurs/${u.uid}`} className="admin-link">
                        {u.fullName || '—'}
                      </Link>
                      <small className="admin-sub">{u.email}</small>
                    </td>
                    <td>{u.phone}</td>
                    <td>{formatFcfa(u.balanceReal)}</td>
                    <td>{formatFcfa(u.balanceBonus)}</td>
                    <td>{u.verified ? 'Oui' : 'Non'}</td>
                    <td>{u.createdAt ? new Date(u.createdAt).toLocaleDateString('fr-FR') : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {users && users.length > 0 && (
          <TablePager
            page={paging.page}
            hasPrev={paging.hasPrev}
            hasNext={paging.hasNext}
            loading={paging.loading}
            onPrev={paging.prev}
            onNext={paging.next}
          />
        )}
        {error && <p className="admin-error" role="alert">{error}</p>}
      </section>
    </AdminShell>
  );
}
