import { useEffect, useState } from 'react';
import AdminShell from './AdminShell.jsx';
import { functions } from '../../lib/firebase.js';

const ROLE_LABELS = {
  super_admin: 'Super administrateur',
  finance: 'Finance',
  support: 'Support',
  trader: 'Trader',
};

// Gestion des administrateurs. Réservée au super administrateur : le serveur refuse les autres.
export default function AdminAdmins() {
  const [admins, setAdmins] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState({});

  const [email, setEmail] = useState('');
  const [found, setFound] = useState(null);
  const [newRole, setNewRole] = useState('support');
  const [lookupError, setLookupError] = useState('');

  function loadAdmins() {
    return functions
      .httpsCallable('adminListAdmins')({})
      .then(({ data }) => setAdmins(data.admins))
      .catch((err) => setError(err?.message || 'Lecture impossible.'));
  }

  useEffect(() => {
    loadAdmins();
  }, []);

  async function changeRole(uid, role) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await functions.httpsCallable('adminSetAdminRole')({ uid, role });
      setMessage(role === 'none' ? 'Droits retirés.' : 'Rôle enregistré.');
      setPending((current) => {
        const next = { ...current };
        delete next[uid];
        return next;
      });
      await loadAdmins();
      return true;
    } catch (err) {
      setError(err?.message || 'Action impossible.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  // Recherche exacte par e-mail parmi les joueurs.
  async function lookup(event) {
    event.preventDefault();
    setFound(null);
    setLookupError('');
    setMessage('');
    const term = email.trim().toLowerCase();
    try {
      const { data } = await functions.httpsCallable('adminListUsers')({ search: term });
      const match = (data.users || []).find((u) => u.email === term);
      if (match) setFound(match);
      else setLookupError('Aucun joueur avec cette adresse e-mail. Le compte doit exister avant d’être nommé administrateur.');
    } catch (err) {
      setLookupError(err?.message || 'Recherche impossible.');
    }
  }

  async function addAdmin() {
    if (!found) return;
    const ok = await changeRole(found.uid, newRole);
    if (ok) {
      setFound(null);
      setEmail('');
    }
  }

  return (
    <AdminShell active="admins">
      <section className="admin-card">
        <h2>Administrateurs</h2>
        <p className="admin-help">Chaque changement de rôle est enregistré dans le journal d'audit.</p>

        {!admins && !error && <p className="admin-hint">Chargement…</p>}
        {admins && admins.length === 0 && <p className="admin-hint">Aucun administrateur.</p>}
        {admins && admins.length > 0 && (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Administrateur</th>
                  <th>Rôle</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {admins.map((admin) => (
                  <tr key={admin.uid}>
                    <td>
                      {admin.fullName || '—'}
                      <small className="admin-sub">{admin.email}</small>
                    </td>
                    <td>
                      <select
                        value={pending[admin.uid] ?? admin.role}
                        onChange={(e) => setPending((current) => ({ ...current, [admin.uid]: e.target.value }))}
                        aria-label={`Rôle de ${admin.fullName || admin.email}`}
                      >
                        {Object.entries(ROLE_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                        <option value="none">Retirer les droits</option>
                      </select>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="admin-primary"
                        disabled={busy || pending[admin.uid] === undefined || pending[admin.uid] === admin.role}
                        onClick={() => changeRole(admin.uid, pending[admin.uid])}
                      >
                        Appliquer
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <h3>Ajouter un administrateur</h3>
        <form className="admin-search" onSubmit={lookup}>
          <input
            type="email"
            placeholder="E-mail du joueur"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-label="E-mail du joueur à nommer administrateur"
          />
          <button type="submit" className="admin-primary" disabled={!email.trim()}>Rechercher</button>
        </form>
        {lookupError && <p className="admin-error" role="alert">{lookupError}</p>}
        {found && (
          <div className="admin-row">
            <p>
              <strong>{found.fullName || '—'}</strong> <span className="admin-sub">{found.email}</span>
            </p>
            <label className="admin-form">
              Rôle
              <select value={newRole} onChange={(e) => setNewRole(e.target.value)}>
                {Object.entries(ROLE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <div className="admin-actions">
              <button type="button" className="admin-primary" disabled={busy} onClick={addAdmin}>
                Nommer administrateur
              </button>
            </div>
          </div>
        )}

        {message && <p className="admin-ok" role="status">{message}</p>}
        {error && <p className="admin-error" role="alert">{error}</p>}
      </section>
    </AdminShell>
  );
}
