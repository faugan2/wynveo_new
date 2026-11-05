import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
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
  open: 'En cours',
  won: 'Gagné',
  lost: 'Perdu',
  void: 'Remboursé',
  cashed: 'Encaissé',
  settled: 'Réglé',
};

// Fiche d'un joueur : profil, soldes, puis historique des opérations paginé (lecture seule).
export default function AdminUser() {
  const { uid } = useParams();
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  const [message, setMessage] = useState({ type: '', text: '' });
  const [busy, setBusy] = useState(false);
  const [suspendReason, setSuspendReason] = useState('');
  const [adjust, setAdjust] = useState({ bucket: 'real', direction: 'credit', amount: '', reason: '' });
  const [confirmAdjust, setConfirmAdjust] = useState(false);

  function loadProfile() {
    return functions
      .httpsCallable('adminGetUser')({ uid })
      .then(({ data }) => setProfile(data.user))
      .catch((err) => setError(err?.message || 'Lecture impossible.'));
  }

  useEffect(() => {
    setProfile(null);
    setError('');
    setMessage({ type: '', text: '' });
    setConfirmAdjust(false);
    loadProfile();
  }, [uid]);

  // Exécute une action d'administration côté serveur, puis recharge la fiche. Renvoie true si l'action a réussi.
  async function runAction(name, payload, okText) {
    setBusy(true);
    setMessage({ type: '', text: '' });
    try {
      await functions.httpsCallable(name)({ uid, ...payload });
      setMessage({ type: 'ok', text: okText });
      await loadProfile();
      return true;
    } catch (err) {
      setMessage({ type: 'error', text: err?.message || 'Action impossible.' });
      return false;
    } finally {
      setBusy(false);
    }
  }

  function toggleSuspend(suspended) {
    return runAction(
      'adminSetSuspended',
      { suspended, reason: suspendReason },
      suspended ? 'Compte suspendu.' : 'Compte réactivé.'
    ).then((ok) => {
      if (ok) setSuspendReason('');
    });
  }

  const adjustValue = Number(adjust.amount);
  const validAdjust = Number.isInteger(adjustValue) && adjustValue > 0 && adjust.reason.trim().length >= 3;

  function applyAdjust() {
    const amount = adjust.direction === 'debit' ? -adjustValue : adjustValue;
    runAction('adminAdjustBalance', { bucket: adjust.bucket, amount, reason: adjust.reason.trim() }, 'Solde ajusté.').then(
      (ok) => {
        if (ok) {
          setAdjust({ ...adjust, amount: '', reason: '' });
          setConfirmAdjust(false);
        }
      }
    );
  }

  const paging = useCursorPaging(
    (cursor) =>
      functions
        .httpsCallable('adminListUserOperations')({ uid, type: typeFilter, cursor, pageSize: 20 })
        .then(({ data }) => ({ items: data.operations, next: data.next })),
    `${uid}|${typeFilter}`
  );
  const operations = paging.items;

  return (
    <AdminShell active="utilisateurs">
      <p className="admin-back-link">
        <Link to="/admin/utilisateurs">← Retour à la liste</Link>
      </p>

      {!profile && !error && <p className="admin-hint">Chargement…</p>}
      {error && <p className="admin-error" role="alert">{error}</p>}

      {profile && (
        <>
          <section className="admin-card">
            <h2>{profile.fullName || 'Joueur'}</h2>
            <dl className="admin-facts">
              <div><dt>Téléphone</dt><dd>{profile.phone || '—'}</dd></div>
              <div><dt>E-mail</dt><dd>{profile.email || '—'}</dd></div>
              <div><dt>Code de parrainage</dt><dd>{profile.referralCode || '—'}</dd></div>
              <div><dt>Vérifié</dt><dd>{profile.verified ? 'Oui' : 'Non'}</dd></div>
              <div><dt>Inscrit le</dt><dd>{profile.createdAt ? new Date(profile.createdAt).toLocaleDateString('fr-FR') : '—'}</dd></div>
            </dl>
          </section>

          <section className="admin-stats">
            <div className="admin-stat">
              <span>Solde réel</span>
              <strong>{formatFcfa(profile.balanceReal)}</strong>
            </div>
            <div className="admin-stat">
              <span>Bonus</span>
              <strong>{formatFcfa(profile.balanceBonus)}</strong>
            </div>
          </section>

          {message.text && (
            <p className={message.type === 'ok' ? 'admin-ok' : 'admin-error'} role="alert">{message.text}</p>
          )}

          <section className="admin-card">
            <h3>Statut du compte</h3>
            {profile.suspended ? (
              <p className="admin-denied">Suspendu{profile.suspendedReason ? ` : ${profile.suspendedReason}` : ''}</p>
            ) : (
              <p className="admin-ok">Actif</p>
            )}
            <label className="admin-form">
              Motif
              <input
                type="text"
                maxLength={200}
                value={suspendReason}
                onChange={(e) => setSuspendReason(e.target.value)}
                placeholder="Obligatoire pour suspendre ou réactiver"
              />
            </label>
            <div className="admin-actions">
              {profile.suspended ? (
                <button
                  type="button"
                  className="admin-primary"
                  disabled={busy || suspendReason.trim().length < 3}
                  onClick={() => toggleSuspend(false)}
                >
                  Réactiver le compte
                </button>
              ) : (
                <button
                  type="button"
                  className="admin-danger"
                  disabled={busy || suspendReason.trim().length < 3}
                  onClick={() => toggleSuspend(true)}
                >
                  Suspendre le compte
                </button>
              )}
            </div>
          </section>

          <section className="admin-card">
            <h3>Ajuster le solde</h3>
            <p className="admin-help">Chaque ajustement est enregistré dans le journal d'audit.</p>
            <div className="admin-row">
              <label className="admin-form">
                Solde
                <select value={adjust.bucket} onChange={(e) => setAdjust({ ...adjust, bucket: e.target.value })}>
                  <option value="real">Réel</option>
                  <option value="bonus">Bonus</option>
                </select>
              </label>
              <label className="admin-form">
                Sens
                <select value={adjust.direction} onChange={(e) => setAdjust({ ...adjust, direction: e.target.value })}>
                  <option value="credit">Crédit (ajouter)</option>
                  <option value="debit">Débit (retirer)</option>
                </select>
              </label>
              <label className="admin-form">
                Montant (FCFA)
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={adjust.amount}
                  onChange={(e) => setAdjust({ ...adjust, amount: e.target.value })}
                />
              </label>
            </div>
            <label className="admin-form">
              Motif
              <input
                type="text"
                maxLength={200}
                value={adjust.reason}
                onChange={(e) => setAdjust({ ...adjust, reason: e.target.value })}
                placeholder="Ex. : geste commercial, erreur de dépôt"
              />
            </label>
            <div className="admin-actions">
              {!confirmAdjust ? (
                <button
                  type="button"
                  className="admin-primary"
                  disabled={busy || !validAdjust}
                  onClick={() => setConfirmAdjust(true)}
                >
                  Continuer
                </button>
              ) : (
                <div className="admin-confirm">
                  <p className="admin-help">
                    {adjust.direction === 'debit' ? 'Débit' : 'Crédit'} de {formatFcfa(adjustValue)} sur le solde{' '}
                    {adjust.bucket === 'real' ? 'réel' : 'bonus'}. Confirmer ?
                  </p>
                  <button type="button" onClick={() => setConfirmAdjust(false)} disabled={busy}>
                    Annuler
                  </button>
                  <button type="button" className="admin-primary" onClick={applyAdjust} disabled={busy}>
                    Confirmer
                  </button>
                </div>
              )}
            </div>
          </section>

          <section className="admin-card">
            <h3>Opérations</h3>
            <div className="admin-filters">
              <label>
                Type
                <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                  <option value="">Tous</option>
                  <option value="Dépôt">Dépôt</option>
                  <option value="Dépôt crypto">Dépôt crypto</option>
                  <option value="Pari">Pari</option>
                </select>
              </label>
            </div>

            {!operations && !paging.error && <p className="admin-hint">Chargement…</p>}
            {operations && operations.length === 0 && <p className="admin-hint">Aucune opération.</p>}
            {operations && operations.length > 0 && (
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Type</th>
                      <th>Détail</th>
                      <th>Montant</th>
                      <th>Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {operations.map((op) => (
                      <tr key={`${op.type}-${op.id}`}>
                        <td>{op.createdAt ? new Date(op.createdAt).toLocaleString('fr-FR') : '—'}</td>
                        <td>{op.type}</td>
                        <td>{op.detail}</td>
                        <td className={op.amount < 0 ? 'admin-neg' : ''}>{formatFcfa(op.amount)}</td>
                        <td>{STATUS_LABELS[op.status] || op.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {operations && operations.length > 0 && (
              <TablePager
                page={paging.page}
                hasPrev={paging.hasPrev}
                hasNext={paging.hasNext}
                loading={paging.loading}
                onPrev={paging.prev}
                onNext={paging.next}
              />
            )}
            {paging.error && <p className="admin-error" role="alert">{paging.error}</p>}
          </section>
        </>
      )}
    </AdminShell>
  );
}
