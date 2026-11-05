import { useState } from 'react';
import { Link } from 'react-router-dom';
import AdminShell from './AdminShell.jsx';
import TablePager from '../../components/Admin/TablePager.jsx';
import { useCursorPaging } from '../../lib/adminPaging.js';
import { functions } from '../../lib/firebase.js';
import { formatFcfa } from '../../lib/format.js';

const STATUS_LABELS = {
  open: 'En cours',
  won: 'Gagné',
  lost: 'Perdu',
  void: 'Remboursé',
  cashed: 'Encaissé',
  settled: 'Réglé',
};

const GAME_LABELS = {
  'lucky-spin': 'Lucky Spin',
  'mystery-box': 'Mystery Box',
  'lucky-number': 'Lucky Number',
  jackpot: 'Jackpot',
  crash: 'Crash',
  sport: 'Sport',
};

// Paris de tous les jeux, du plus récent au plus ancien, par pages de 20 (lecture seule).
export default function AdminBets() {
  const [status, setStatus] = useState('');
  const [game, setGame] = useState('');
  const [backfilling, setBackfilling] = useState(false);
  const [backfillMessage, setBackfillMessage] = useState('');
  const [backfillError, setBackfillError] = useState('');

  // Traite les anciens paris par tranches de 300, jusqu'au dernier.
  async function backfill() {
    setBackfilling(true);
    setBackfillMessage('');
    setBackfillError('');
    let cursor = null;
    let total = 0;
    try {
      do {
        const { data } = await functions.httpsCallable('adminBackfillBetResults')({ cursor });
        total += data.updated;
        cursor = data.next;
      } while (cursor);
      setBackfillMessage(`Terminé : ${total} pari(s) complété(s).`);
    } catch (err) {
      setBackfillError(err?.message || 'Mise à jour impossible.');
    } finally {
      setBackfilling(false);
    }
  }

  const resetKey = `${status}|${game}`;
  const paging = useCursorPaging(
    (cursor) =>
      functions
        .httpsCallable('adminListBets')({ status, game, cursor, pageSize: 20 })
        .then(({ data }) => ({ items: data.bets, next: data.next })),
    resetKey
  );
  const { items: bets, error } = paging;

  return (
    <AdminShell active="paris">
      <section className="admin-card">
        <h2>Paris</h2>
        <p className="admin-help">Suivi des paris et de leur règlement. Lecture seule.</p>
        <div className="admin-actions">
          <button type="button" className="admin-primary" disabled={backfilling} onClick={backfill}>
            {backfilling ? 'Mise à jour en cours…' : 'Compléter les résultats des anciens paris'}
          </button>
        </div>
        {backfillMessage && <p className="admin-ok" role="status">{backfillMessage}</p>}
        {backfillError && <p className="admin-error" role="alert">{backfillError}</p>}

        <div className="admin-filters">
          <label>
            Statut
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Tous</option>
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label>
            Jeu
            <select value={game} onChange={(e) => setGame(e.target.value)}>
              <option value="">Tous</option>
              {Object.entries(GAME_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
        </div>

        {!bets && !error && <p className="admin-hint">Chargement…</p>}
        {bets && bets.length === 0 && <p className="admin-hint">Aucun pari pour ces filtres.</p>}
        {bets && bets.length > 0 && (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Jeu</th>
                  <th>Mise</th>
                  <th>Gain</th>
                  <th>Statut</th>
                  <th>Réglé le</th>
                  <th>Joueur</th>
                </tr>
              </thead>
              <tbody>
                {bets.map((bet) => (
                  <tr key={bet.id}>
                    <td>{bet.createdAt ? new Date(bet.createdAt).toLocaleString('fr-FR') : '—'}</td>
                    <td>{bet.game}</td>
                    <td>{formatFcfa(bet.stake)}</td>
                    <td>{bet.payout == null ? '—' : formatFcfa(bet.payout)}</td>
                    <td>{STATUS_LABELS[bet.status] || bet.status}</td>
                    <td>{bet.settledAt ? new Date(bet.settledAt).toLocaleString('fr-FR') : '—'}</td>
                    <td>
                      {bet.uid ? <Link to={`/admin/utilisateurs/${bet.uid}`} className="admin-link">Voir</Link> : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {bets && bets.length > 0 && (
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
