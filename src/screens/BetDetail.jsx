import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { IoArrowBack, IoCheckmarkCircle, IoCloseCircle, IoRefreshCircle, IoTimeOutline } from 'react-icons/io5';
import ConnectedLayout from '../components/ConnectedLayout.jsx';
import { functions } from '../lib/firebase.js';
import { formatFcfa } from '../lib/format.js';

const STATUS = {
  open: { label: 'En cours', tone: 'is-open' },
  won: { label: 'Gagné', tone: 'is-won' },
  cashed: { label: 'Gagné', tone: 'is-won' },
  lost: { label: 'Perdu', tone: 'is-lost' },
  void: { label: 'Remboursé', tone: 'is-void' },
};

// Résultat d'une sélection : icône et libellé.
const OUTCOME = {
  won: { label: 'Gagnée', icon: IoCheckmarkCircle, tone: 'is-won' },
  lost: { label: 'Perdue', icon: IoCloseCircle, tone: 'is-lost' },
  void: { label: 'Remboursée', icon: IoRefreshCircle, tone: 'is-void' },
  pending: { label: 'En attente', icon: IoTimeOutline, tone: 'is-open' },
};

// Détail d'un ticket sport : statut, sélections avec leur résultat, dates et règlement.
export default function BetDetail() {
  const { betId } = useParams();
  const navigate = useNavigate();
  const [bet, setBet] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    functions
      .httpsCallable('getMySportBet')({ id: betId })
      .then(({ data }) => active && setBet(data))
      .catch((err) => active && setError(err?.message || 'Pari indisponible.'));
    return () => {
      active = false;
    };
  }, [betId]);

  const badge = bet ? STATUS[bet.status] || STATUS.open : null;
  const settled = bet && bet.status !== 'open';
  const net = settled && bet.payout !== null ? bet.payout - bet.stake : null;

  return (
    <ConnectedLayout>
      <div className="bet-detail-head">
        <button type="button" className="icon-button" aria-label="Retour" onClick={() => navigate(-1)}>
          <IoArrowBack />
        </button>
        <h1 className="title-font page-title">Ticket sport</h1>
      </div>

      {error && <p className="error" role="alert">{error}</p>}
      {!bet && !error && <p className="hint">Chargement…</p>}

      {bet && (
        <>
          <section className="wallet-card">
            <div className="bet-head">
              <small>{bet.mode === 'combo' ? 'Combiné' : 'Simple'} · #{bet.id.slice(0, 8).toUpperCase()}</small>
              <span className={`bet-status ${badge.tone}`}>{badge.label}</span>
            </div>
            <div className="summary-row">
              <span>Mise</span>
              <b>{formatFcfa(bet.stake)}</b>
            </div>
            <div className="summary-row">
              <span>Cote</span>
              <b>{bet.totalPrice.toFixed(2)}</b>
            </div>
            <div className="summary-row">
              <span>{settled ? 'Résultat' : 'Gain potentiel'}</span>
              <b className={settled ? (net >= 0 ? 'positive' : 'negative') : 'positive'}>
                {settled ? (net === null ? '—' : formatFcfa(net)) : formatFcfa(bet.potentialPayout)}
              </b>
            </div>
          </section>

          <div className="section-head"><h2>Sélections</h2></div>
          <ul className="bet-selections">
            {bet.selections.map((selection, index) => {
              const outcome = OUTCOME[selection.outcome] || OUTCOME.pending;
              const Icon = outcome.icon;
              return (
                <li key={index}>
                  <span>
                    <strong>{selection.label}</strong>
                    <small>
                      {selection.homeTeam} – {selection.awayTeam}
                      {selection.commenceMs ? ` · ${new Date(selection.commenceMs).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}` : ''}
                    </small>
                  </span>
                  <span className="outcome-cell">
                    <b>{selection.price.toFixed(2)}</b>
                    <span className={`outcome ${outcome.tone}`}>
                      <Icon aria-hidden="true" /> {outcome.label}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>

          <div className="section-head"><h2>Informations</h2></div>
          <div className="summary-row">
            <span>Placé le</span>
            <b>{new Date(bet.createdAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</b>
          </div>
          <div className="summary-row">
            <span>Type</span>
            <b>{bet.mode === 'combo' ? `Combiné (${bet.selections.length})` : 'Simple'}</b>
          </div>
          <div className="summary-row">
            <span>Réglement</span>
            <b>{settled && bet.settledAt ? `Réglé le ${new Date(bet.settledAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}` : 'Automatiquement au règlement'}</b>
          </div>
        </>
      )}
    </ConnectedLayout>
  );
}
