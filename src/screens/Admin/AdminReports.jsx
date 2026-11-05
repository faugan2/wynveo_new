import { useEffect, useState } from 'react';
import AdminShell from './AdminShell.jsx';
import { functions } from '../../lib/firebase.js';
import { formatFcfa } from '../../lib/format.js';

const PERIODS = [
  { key: 'today', label: "Aujourd'hui" },
  { key: '7d', label: '7 jours' },
  { key: '30d', label: '30 jours' },
];

// Rapport d'activité : chiffres clés sur la période choisie (lecture seule, en UTC).
export default function AdminReports() {
  const [period, setPeriod] = useState('today');
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setReport(null);
    setError('');
    functions
      .httpsCallable('adminGetReports')({ period })
      .then(({ data }) => {
        console.info('[rapports] réponse', { period, data });
        setReport(data);
      })
      .catch((err) => {
        // Trace complète côté navigateur : code, message et détail renvoyés par la fonction.
        console.error('[rapports] échec de adminGetReports', {
          period,
          code: err?.code,
          message: err?.message,
          details: err?.details,
          error: err,
        });
        setError(err?.message || 'Lecture impossible.');
      });
  }, [period]);

  return (
    <AdminShell active="rapports">
      <div className="admin-tabs" role="tablist">
        {PERIODS.map((p) => (
          <button
            key={p.key}
            type="button"
            role="tab"
            aria-selected={period === p.key}
            className={period === p.key ? 'is-active' : ''}
            onClick={() => setPeriod(p.key)}
          >
            {p.label}
          </button>
        ))}
      </div>

      {!report && !error && <p className="admin-hint">Chargement…</p>}
      {error && <p className="admin-error" role="alert">{error}</p>}

      {report && (
        <>
          <section className="admin-stats">
            <div className="admin-stat">
              <span>Nouveaux joueurs</span>
              <strong>{report.newPlayers}</strong>
            </div>
            <div className="admin-stat">
              <span>Dépôts</span>
              <strong>{formatFcfa(report.deposits.total)}</strong>
              <small className="admin-sub">{report.deposits.count} dépôt(s)</small>
            </div>
            <div className="admin-stat">
              <span>Mises</span>
              <strong>{formatFcfa(report.bets.stake)}</strong>
              <small className="admin-sub">{report.bets.count} pari(s)</small>
            </div>
            <div className="admin-stat">
              <span>Gains versés</span>
              <strong>{formatFcfa(report.bets.payout)}</strong>
            </div>
            <div className="admin-stat">
              <span>Marge</span>
              <strong className={report.margin != null && report.margin < 0 ? 'admin-neg' : ''}>
                {report.margin == null ? '—' : `${report.margin.toString().replace('.', ',')} %`}
              </strong>
            </div>
            <div className="admin-stat">
              <span>Bonus de parrainage</span>
              <strong>{formatFcfa(report.referralBonuses)}</strong>
            </div>
          </section>
          <p className="admin-help">
            Les gains comptent les paris de la période qui sont réglés. La marge est la part des mises qui reste après les gains.
          </p>
        </>
      )}
    </AdminShell>
  );
}
