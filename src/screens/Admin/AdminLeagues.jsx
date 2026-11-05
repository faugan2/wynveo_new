import { useEffect, useMemo, useState } from 'react';
import { IoRefreshOutline } from 'react-icons/io5';
import AdminShell from './AdminShell.jsx';
import { db, functions } from '../../lib/firebase.js';

// Libellés français des sports, d'après le groupe renvoyé par l'API.
const SPORT_LABELS = {
  Soccer: 'Football',
  Basketball: 'Basket',
  Tennis: 'Tennis',
  'Ice Hockey': 'Hockey sur glace',
  'Mixed Martial Arts': 'MMA',
  'American Football': 'Football américain',
  'Aussie Rules': 'Football australien',
  Boxing: 'Boxe',
  Cricket: 'Cricket',
  Golf: 'Golf',
  Politics: 'Politique',
};

const sportLabel = (group) => SPORT_LABELS[group] || group;

// Compétitions de tous les sports, filtrables par sport. Seul le football peut être importé pour l'instant.
export default function AdminLeagues() {
  const [leagues, setLeagues] = useState(null);
  const [sport, setSport] = useState('Soccer');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  // Lecture directe du catalogue (autorisée aux comptes connectés par les règles Firestore) : pas besoin de fonction.
  function load() {
    return db
      .collection('wy_sport_leagues')
      .get()
      .then((snapshot) =>
        setLeagues(
          snapshot.docs
            .map((doc) => ({
              key: doc.id,
              title: doc.get('title') || doc.id,
              group: doc.get('group') || '',
              enabled: doc.get('enabled') === true,
              visible: doc.get('visible') === true,
              importable: doc.get('group') === 'Soccer',
            }))
            .sort((a, b) => a.title.localeCompare(b.title, 'fr'))
        )
      )
      .catch((err) => setError(err?.message || 'Lecture impossible.'));
  }

  useEffect(() => {
    load();
  }, []);

  // Sports présents dans le catalogue, avec le football en premier.
  const sports = useMemo(() => {
    const groups = [...new Set((leagues || []).map((league) => league.group).filter(Boolean))];
    return groups.sort((a, b) => (a === 'Soccer' ? -1 : b === 'Soccer' ? 1 : sportLabel(a).localeCompare(sportLabel(b), 'fr')));
  }, [leagues]);

  const shown = (leagues || []).filter((league) => league.group === sport);

  async function sync() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const { data } = await functions.httpsCallable('adminSyncSportCatalog')({});
      setMessage(`Catalogue mis à jour : ${data.count} compétition(s).`);
      await load();
    } catch (err) {
      setError(err?.message || 'Mise à jour impossible.');
    } finally {
      setBusy(false);
    }
  }

  async function toggle(league, field) {
    setError('');
    setMessage('');
    try {
      await functions.httpsCallable('adminSetSportLeague')({ key: league.key, [field]: !league[field] });
      setLeagues((current) => current.map((item) => (item.key === league.key ? { ...item, [field]: !item[field] } : item)));
    } catch (err) {
      setError(err?.message || 'Action impossible.');
    }
  }

  return (
    <AdminShell active="competitions">
      <section className="admin-card">
        <h2>Compétitions</h2>
        <p className="admin-help">
          <strong>Importer</strong> : les cotes de la compétition sont chargées toutes les 3 heures, ce qui consomme des crédits de l’API.
          <br />
          <strong>Visible</strong> : les matchs apparaissent dans l’application.
          <br />
          Pour l’instant, seul le football peut être importé.
        </p>
        <div className="admin-actions">
          <button type="button" className="admin-primary" onClick={sync} disabled={busy}>
            <IoRefreshOutline /> {busy ? 'Mise à jour…' : 'Mettre à jour depuis l’API'}
          </button>
        </div>

        {sports.length > 0 && (
          <div className="admin-tabs" role="tablist" aria-label="Sports">
            {sports.map((group) => (
              <button
                key={group}
                type="button"
                role="tab"
                aria-selected={sport === group}
                className={sport === group ? 'is-active' : ''}
                onClick={() => setSport(group)}
              >
                {sportLabel(group)}
              </button>
            ))}
          </div>
        )}

        {!leagues && !error && <p className="admin-hint">Chargement…</p>}
        {leagues && leagues.length === 0 && (
          <p className="admin-hint">Aucune compétition. Cliquez sur « Mettre à jour depuis l’API ».</p>
        )}
        {leagues && leagues.length > 0 && shown.length === 0 && <p className="admin-hint">Aucune compétition pour ce sport.</p>}
        {shown.length > 0 && (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Compétition</th>
                  <th>Clé</th>
                  <th>Importer</th>
                  <th>Visible</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((league) => (
                  <tr key={league.key}>
                    <td>{league.title}</td>
                    <td><small className="admin-sub">{league.key}</small></td>
                    <td>
                      <input
                        type="checkbox"
                        checked={league.enabled}
                        disabled={!league.importable}
                        title={league.importable ? '' : 'Bientôt disponible'}
                        onChange={() => toggle(league, 'enabled')}
                        aria-label={`Importer ${league.title}`}
                      />
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        checked={league.visible}
                        disabled={!league.importable}
                        title={league.importable ? '' : 'Bientôt disponible'}
                        onChange={() => toggle(league, 'visible')}
                        aria-label={`Afficher ${league.title}`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {message && <p className="admin-ok" role="status">{message}</p>}
        {error && <p className="admin-error" role="alert">{error}</p>}
      </section>
    </AdminShell>
  );
}
