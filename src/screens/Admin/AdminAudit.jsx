import AdminShell from './AdminShell.jsx';
import TablePager from '../../components/Admin/TablePager.jsx';
import { useCursorPaging } from '../../lib/adminPaging.js';
import { functions } from '../../lib/firebase.js';

// Journal des actions d'administration, les plus récentes d'abord, par pages de 20.
export default function AdminAudit() {
  const paging = useCursorPaging(
    (cursor) =>
      functions
        .httpsCallable('adminGetAuditLog')({ cursor, pageSize: 20 })
        .then(({ data }) => ({ items: data.entries, next: data.next })),
    'audit'
  );
  const { items: entries, error } = paging;

  return (
    <AdminShell active="journal">
      <section className="admin-card">
        {!entries && !error && <p className="admin-hint">Chargement…</p>}
        {entries && entries.length === 0 && <p className="admin-hint">Aucune action enregistrée.</p>}
        {entries && entries.length > 0 && (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Rôle</th>
                  <th>Action</th>
                  <th>Réglage</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id}>
                    <td>{entry.createdAt ? new Date(entry.createdAt).toLocaleString('fr-FR') : '—'}</td>
                    <td>{entry.role}</td>
                    <td>{entry.action}</td>
                    <td>{entry.setting}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {entries && entries.length > 0 && (
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
