import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import AdminShell from './AdminShell.jsx';
import TablePager from '../../components/Admin/TablePager.jsx';
import { useCursorPaging } from '../../lib/adminPaging.js';
import { functions } from '../../lib/firebase.js';
import { formatFcfa } from '../../lib/format.js';

const DEFAULT_RATES = [10, 5, 3, 2, 1];

// Promotions et bonus : taux du bonus de parrainage (réglable), et bonus versés (lecture seule).
export default function AdminPromotions() {
  const [rates, setRates] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [level, setLevel] = useState('');

  const [welcome, setWelcome] = useState(null);
  const [welcomeStats, setWelcomeStats] = useState(null);
  const [welcomeSaving, setWelcomeSaving] = useState(false);
  const [welcomeMessage, setWelcomeMessage] = useState('');
  const [welcomeError, setWelcomeError] = useState('');

  function loadWelcome() {
    functions
      .httpsCallable('adminGetSettings')({ name: 'welcome-bonus' })
      .then(({ data }) => setWelcome({ enabled: false, amountXof: 0, ...data.values }))
      .catch((err) => setWelcomeError(err?.message || 'Lecture impossible.'));
    functions
      .httpsCallable('adminGetWelcomeBonusStats')({})
      .then(({ data }) => setWelcomeStats(data))
      .catch(() => setWelcomeStats(null));
  }

  useEffect(() => {
    loadWelcome();
  }, []);

  const welcomeAmount = welcome ? Number(welcome.amountXof) : 0;
  const welcomeValid = welcome && String(welcome.amountXof).trim() !== '' && Number.isInteger(welcomeAmount) && welcomeAmount >= 0;

  async function saveWelcome(event) {
    event.preventDefault();
    setWelcomeMessage('');
    setWelcomeError('');
    setWelcomeSaving(true);
    try {
      await functions.httpsCallable('adminSaveSettings')({
        name: 'welcome-bonus',
        values: { enabled: Boolean(welcome.enabled), amountXof: welcomeAmount },
      });
      setWelcomeMessage(welcome.enabled ? 'Bonus de bienvenue activé.' : 'Bonus de bienvenue désactivé.');
      loadWelcome();
    } catch (err) {
      setWelcomeError(err?.message || 'Enregistrement impossible.');
    } finally {
      setWelcomeSaving(false);
    }
  }

  useEffect(() => {
    functions
      .httpsCallable('adminGetSettings')({ name: 'referral' })
      .then(({ data }) => setRates((data.values?.rates || DEFAULT_RATES).map(String)))
      .catch((err) => setError(err?.message || 'Lecture impossible.'));
  }, []);

  const total = rates ? rates.reduce((sum, r) => sum + (Number(r) || 0), 0) : 0;
  const ratesValid = rates && rates.every((r) => r.trim() !== '' && Number(r) >= 0 && Number(r) <= 100) && total <= 100;

  async function saveRates(event) {
    event.preventDefault();
    setMessage('');
    setError('');
    setSaving(true);
    try {
      await functions.httpsCallable('adminSaveSettings')({
        name: 'referral',
        values: { rates: rates.map((r) => Number(r)) },
      });
      setMessage('Taux enregistrés. Ils s’appliquent aux prochains dépôts des filleuls.');
    } catch (err) {
      setError(err?.message || 'Enregistrement impossible.');
    } finally {
      setSaving(false);
    }
  }

  const resetKey = level;
  const paging = useCursorPaging(
    (cursor) =>
      functions
        .httpsCallable('adminListReferralBonuses')({ level, cursor, pageSize: 20 })
        .then(({ data }) => ({ items: data.bonuses, next: data.next })),
    resetKey
  );
  const { items: bonuses, error: listError } = paging;

  return (
    <AdminShell active="promotions">
      <section className="admin-card">
        <h2>Bonus de bienvenue</h2>
        <p className="admin-help">
          Versé une seule fois par joueur, au premier dépôt confirmé (le compte devient vérifié). Il est crédité sur le solde bonus.
        </p>
        {!welcome && !welcomeError && <p className="admin-hint">Chargement…</p>}
        {welcome && (
          <form className="admin-form" onSubmit={saveWelcome}>
            <label className="admin-check">
              <input
                type="checkbox"
                checked={Boolean(welcome.enabled)}
                onChange={(e) => setWelcome({ ...welcome, enabled: e.target.checked })}
              />
              Bonus de bienvenue activé
            </label>
            <label>
              Montant (FCFA)
              <input
                type="number"
                min="0"
                step="1"
                value={welcome.amountXof}
                onChange={(e) => setWelcome({ ...welcome, amountXof: e.target.value })}
              />
            </label>
            <div className="admin-actions">
              <button type="submit" className="admin-primary" disabled={welcomeSaving || !welcomeValid}>
                {welcomeSaving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </form>
        )}
        {welcomeStats && (
          <p className="admin-hint">
            Déjà versé : {welcomeStats.grantedCount} joueur(s), {formatFcfa(welcomeStats.grantedTotal)}.
          </p>
        )}
        {welcomeMessage && <p className="admin-ok" role="status">{welcomeMessage}</p>}
        {welcomeError && <p className="admin-error" role="alert">{welcomeError}</p>}
      </section>

      <section className="admin-card">
        <h2>Bonus de parrainage</h2>
        <p className="admin-help">
          Pourcentage du dépôt d’un filleul reversé au parrain, par niveau. La somme des 5 taux ne peut pas dépasser 100 %.
        </p>
        {!rates && !error && <p className="admin-hint">Chargement…</p>}
        {rates && (
          <form className="admin-form" onSubmit={saveRates}>
            <div className="admin-row">
              {rates.map((rate, index) => (
                <label key={index}>
                  Niveau {index + 1} (%)
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.5"
                    value={rate}
                    onChange={(e) => {
                      const next = [...rates];
                      next[index] = e.target.value;
                      setRates(next);
                    }}
                  />
                </label>
              ))}
            </div>
            <p className={total <= 100 ? 'admin-hint' : 'admin-error'}>Total : {total} % {total > 100 ? '— trop élevé' : ''}</p>
            <div className="admin-actions">
              <button type="submit" className="admin-primary" disabled={saving || !ratesValid}>
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </form>
        )}
        {message && <p className="admin-ok" role="status">{message}</p>}
        {error && <p className="admin-error" role="alert">{error}</p>}
      </section>

      <section className="admin-card">
        <h2>Bonus versés</h2>
        <div className="admin-filters">
          <label>
            Niveau
            <select value={level} onChange={(e) => setLevel(e.target.value)}>
              <option value="">Tous</option>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>Niveau {n}</option>
              ))}
            </select>
          </label>
        </div>

        {!bonuses && !listError && <p className="admin-hint">Chargement…</p>}
        {bonuses && bonuses.length === 0 && <p className="admin-hint">Aucun bonus versé pour ce niveau.</p>}
        {bonuses && bonuses.length > 0 && (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Niveau</th>
                  <th>Montant</th>
                  <th>Parrain</th>
                  <th>Filleul</th>
                </tr>
              </thead>
              <tbody>
                {bonuses.map((bonus) => (
                  <tr key={bonus.id}>
                    <td>{bonus.createdAt ? new Date(bonus.createdAt).toLocaleString('fr-FR') : '—'}</td>
                    <td>{bonus.level}</td>
                    <td>{formatFcfa(bonus.amount)}</td>
                    <td><Link to={`/admin/utilisateurs/${bonus.referrerId}`} className="admin-link">Voir</Link></td>
                    <td><Link to={`/admin/utilisateurs/${bonus.referredId}`} className="admin-link">Voir</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {bonuses && bonuses.length > 0 && (
          <TablePager
            page={paging.page}
            hasPrev={paging.hasPrev}
            hasNext={paging.hasNext}
            loading={paging.loading}
            onPrev={paging.prev}
            onNext={paging.next}
          />
        )}
        {listError && <p className="admin-error" role="alert">{listError}</p>}
      </section>
    </AdminShell>
  );
}
