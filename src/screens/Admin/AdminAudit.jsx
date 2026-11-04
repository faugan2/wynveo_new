import { useEffect, useState } from 'react';
import AdminShell from './AdminShell.jsx';
import { functions } from '../../lib/firebase.js';

// Journal des actions d'administration, les plus récentes d'abord.
export default function AdminAudit() {
  const [entries, setEntries] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    functions
      .httpsCallable('adminGetAuditLog')({})
      .then(({ data }) => setEntries(data.entries))
      .catch((err) => setError(err?.message || 'Lecture impossible.'));
  }, []);

  return (
    <AdminShell active="journal">
      <section className="admin-card">
        {!entries && !error && <p className="admin-hint">Chargement…</p>}
        {entries && entries.length === 0 && <p className="admin-hint">Aucune action enregistrée.</p>}
        {entries && entries.length > 0 && (
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
        )}
        {error && <p className="admin-error" role="alert">{error}</p>}
      </section>
    </AdminShell>
  );
}
