import { useState } from 'react';
import { Link } from 'react-router-dom';
import AdminShell from './AdminShell.jsx';
import TablePager from '../../components/Admin/TablePager.jsx';
import { useCursorPaging } from '../../lib/adminPaging.js';
import { functions } from '../../lib/firebase.js';
import { formatFcfa } from '../../lib/format.js';

const STATUS_LABELS = {
  credited: 'Crédité',
  confirmed: 'Confirmé',
  pending: 'En attente',
  expired: 'Expiré',
  simulated: 'Simulé',
  failed: 'Échoué',
};

const SOURCES = {
  crypto: 'Demandes de dépôt crypto',
  ledger: 'Crédits enregistrés',
};

// Dépôts, du plus récent au plus ancien, par pages de 20 (lecture seule).
export default function AdminTransactions() {
  const [source, setSource] = useState('crypto');
  const [status, setStatus] = useState('');

  const resetKey = `${source}|${status}`;
  const paging = useCursorPaging(
    (cursor) =>
      functions
        .httpsCallable('adminListDeposits')({ source, status, cursor, pageSize: 20 })
        .then(({ data }) => ({ items: data.deposits, next: data.next })),
    resetKey
  );
  const { items: rows, error } = paging;

  return (
    <AdminShell active="transactions">
      <section className="admin-card">
        <h2>Dépôts</h2>
        <p className="admin-help">Les retraits ne sont pas encore enregistrés : ils apparaîtront ici dès leur mise en service.</p>

        <div className="admin-filters">
          <label>
            Source
            <select value={source} onChange={(e) => setSource(e.target.value)}>
              {Object.entries(SOURCES).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label>
            Statut
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Tous</option>
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
        </div>

        {!rows && !error && <p className="admin-hint">Chargement…</p>}
        {rows && rows.length === 0 && <p className="admin-hint">Aucune transaction pour ces filtres.</p>}
        {rows && rows.length > 0 && (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Détail</th>
                  <th>Montant</th>
                  <th>Statut</th>
                  <th>Joueur</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.createdAt ? new Date(row.createdAt).toLocaleString('fr-FR') : '—'}</td>
                    <td>{row.type}</td>
                    <td>{row.detail}</td>
                    <td>{formatFcfa(row.amount)}</td>
                    <td>{STATUS_LABELS[row.status] || row.status}</td>
                    <td>
                      {row.uid ? <Link to={`/admin/utilisateurs/${row.uid}`} className="admin-link">Voir</Link> : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {rows && rows.length > 0 && (
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
