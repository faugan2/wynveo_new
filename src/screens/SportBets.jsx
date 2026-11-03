import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ConnectedLayout from '../components/ConnectedLayout.jsx';
import { functions } from '../lib/firebase.js';
import { formatFcfa } from '../lib/format.js';

const STATUS = {
  open: { label: 'En cours', tone: 'is-open' },
  won: { label: 'Gagné', tone: 'is-won' },
  lost: { label: 'Perdu', tone: 'is-lost' },
  void: { label: 'Remboursé', tone: 'is-void' },
  cashed: { label: 'Gagné', tone: 'is-won' },
};

// Mes paris Sport : en cours ou terminés (les données viennent de getMySportBets).
export default function SportBets() {
  const navigate = useNavigate();
  const [bets, setBets] = useState(null);
  const [tab, setTab] = useState('open');
  const [error, setError] = useState('');

  const load = useCallback(() => {
    functions
      .httpsCallable('getMySportBets')({})
      .then(({ data }) => setBets(data.bets))
      .catch((err) => setError(err?.message || 'Paris indisponibles pour le moment.'));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const shown = (bets || []).filter((bet) => (tab === 'open' ? bet.status === 'open' : bet.status !== 'open'));

  return (
    <ConnectedLayout>
      <h1 className="title-font page-title">Mes paris</h1>

      <div className="segmented" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'open'} className={tab === 'open' ? 'is-active' : ''} onClick={() => setTab('open')}>
          En cours
        </button>
        <button type="button" role="tab" aria-selected={tab === 'done'} className={tab === 'done' ? 'is-active' : ''} onClick={() => setTab('done')}>
          Terminés
        </button>
      </div>

      {error && <p className="error" role="alert">{error}</p>}
      {!bets && !error && <p className="hint">Chargement…</p>}
      {bets && shown.length === 0 && (
        <p className="note">
          {tab === 'open' ? 'Aucun pari en cours.' : 'Aucun pari terminé.'}{' '}
          <button type="button" className="link-button" onClick={() => navigate('/sport')}>Parier</button>
        </p>
      )}

      <ul className="bet-list">
        {shown.map((bet) => {
          const status = STATUS[bet.status] || STATUS.open;
          const settled = bet.status !== 'open';
          const net = settled && bet.payout !== null ? bet.payout - bet.stake : null;
          return (
            <li key={bet.id} className="bet-card">
              <div className="bet-head">
                <small>{bet.mode === 'combo' ? 'Combiné' : 'Simple'} · #{bet.id.slice(0, 8).toUpperCase()}</small>
                <span className={`bet-status ${status.tone}`}>{status.label}</span>
              </div>
              <ul className="bet-selections">
                {bet.selections.map((selection, index) => (
                  <li key={index}>
                    <span>
                      <strong>{selection.label}</strong>
                      <small>{selection.homeTeam} – {selection.awayTeam}</small>
                    </span>
                    <b>{selection.price.toFixed(2)}</b>
                  </li>
                ))}
              </ul>
              <div className="summary-row">
                <span>Mise</span>
                <b>{formatFcfa(bet.stake)}</b>
              </div>
              {settled ? (
                <div className="summary-row">
                  <span>Résultat</span>
                  <b className={net >= 0 ? 'positive' : 'negative'}>{net === null ? '—' : formatFcfa(net)}</b>
                </div>
              ) : (
                <div className="summary-row">
                  <span>Gain potentiel</span>
                  <b className="positive">{formatFcfa(bet.potentialPayout)}</b>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </ConnectedLayout>
  );
}
