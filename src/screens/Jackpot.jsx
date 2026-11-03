import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import ConnectedLayout from '../components/ConnectedLayout.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { db, functions } from '../lib/firebase.js';
import { formatFcfa } from '../lib/format.js';
import { walletFromProfile } from '../lib/wallet.js';

// Compte à rebours (HH, MM, SS) jusqu'au tirage.
function splitCountdown(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return {
    hours: Math.floor(total / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
}

const pad = (value) => String(value).padStart(2, '0');

// « Aujourd'hui à 20:00 » ou « Demain à 20:00 ».
function drawLabel(drawAt) {
  const date = new Date(drawAt);
  const today = new Date();
  const tomorrow = new Date(Date.now() + 24 * 3600 * 1000);
  const day =
    date.toDateString() === today.toDateString()
      ? "Aujourd'hui"
      : date.toDateString() === tomorrow.toDateString()
        ? 'Demain'
        : date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
  return `${day} à ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// Écran Jackpot quotidien : cagnotte, vos tickets, compte à rebours, derniers gagnants (maquette 14).
export default function Jackpot() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const wallet = walletFromProfile(profile);
  const available = wallet.deposit + wallet.bonus;

  const [state, setState] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());

  const loadState = useCallback(() => {
    functions
      .httpsCallable('getJackpotState')({})
      .then(({ data }) => setState(data))
      .catch((err) => setLoadError(err?.message || 'Jackpot indisponible.'));
  }, []);

  useEffect(() => {
    loadState();
  }, [loadState]);

  // Écoute en direct : achat, tirage et nouveau tour mettent la page à jour sans rechargement.
  useEffect(() => {
    const unsubscribeRound = db
      .collection('wy_jackpot_rounds')
      .where('status', '==', 'open')
      .limit(1)
      .onSnapshot(() => loadState(), () => {});
    const unsubscribeSettings = db
      .collection('wy_settings')
      .doc('jackpot')
      .onSnapshot(() => loadState(), () => {});
    return () => {
      unsubscribeRound();
      unsubscribeSettings();
    };
  }, [loadState]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Une seule relance par tour, au moment du tirage.
  const reloadedFor = useRef(null);
  useEffect(() => {
    if (state && now >= state.drawAt && reloadedFor.current !== state.roundId) {
      reloadedFor.current = state.roundId;
      loadState();
    }
  }, [now, state, loadState]);

  async function addTicket() {
    if (!state || submitting || available < state.ticketPrice) return;
    setError('');
    setSubmitting(true);
    try {
      await functions.httpsCallable('playJackpot')({ quantity: 1 });
    } catch (err) {
      setError(err?.message || 'Achat impossible. Réessayez.');
    } finally {
      setSubmitting(false);
    }
  }

  const remaining = state ? state.drawAt - now : 0;
  const countdown = splitCountdown(remaining);
  const participating = state && state.myTickets > 0;

  return (
    <ConnectedLayout>
      <button type="button" className="back-button" onClick={() => navigate('/jeux')} aria-label="Retour aux jeux">
        ‹
      </button>

      <div className="jackpot-hero">
        <span className="jackpot-crown" aria-hidden="true">👑</span>
        <h1 className="title-font">{participating ? 'Vous participez !' : 'Jackpot quotidien'}</h1>
        <p>{participating ? 'Bonne chance pour le tirage de ce soir.' : 'Un gagnant chaque jour à 20 h.'}</p>
      </div>

      {loadError && <p className="error" role="alert">{loadError}</p>}

      {state && (
        <>
          <section className="pot-card">
            <small>Cagnotte actuelle</small>
            <div className="pot-amount">{formatFcfa(state.pot)}</div>
          </section>

          <section className="ticket-card" aria-label="Votre ticket">
            <div className="ticket-row">
              <span>Mise</span>
              <b>{formatFcfa(state.ticketPrice)}</b>
            </div>
            <div className="ticket-row">
              <span>Tirage</span>
              <b>{drawLabel(state.drawAt)}</b>
            </div>
            <div className="ticket-row">
              <span>Vos tickets</span>
              <b>{state.myTickets} sur {state.ticketsCount}</b>
            </div>
          </section>

          <section className="countdown-card">
            <small>Tirage dans</small>
            <div className="countdown">
              <span><b>{pad(countdown.hours)}</b><small>heures</small></span>
              <span><b>{pad(countdown.minutes)}</b><small>min</small></span>
              <span><b>{pad(countdown.seconds)}</b><small>sec</small></span>
            </div>
          </section>

          {error && <p className="error" role="alert">{error}</p>}

          <button
            type="button"
            className="btn btn-orange"
            onClick={addTicket}
            disabled={submitting || available < state.ticketPrice}
          >
            {submitting ? 'Achat…' : 'Ajouter un ticket'}
            <small>{formatFcfa(state.ticketPrice)} · {Math.round(state.potShare * 100)} % vont à la cagnotte</small>
          </button>

          <h2 className="section-title">Derniers gagnants</h2>
          {state.recentWinners.length === 0 ? (
            <p className="note">Pas encore de gagnant.</p>
          ) : (
            <ul className="member-list">
              {state.recentWinners.map((winner) => (
                <li key={winner.roundId} className="member-item">
                  <div style={{ flex: 1 }}>
                    <strong>{winner.winnerName}</strong>
                    <small>
                      {new Date(winner.closedAt).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}
                    </small>
                  </div>
                  <b className="gold">{formatFcfa(winner.prize)}</b>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </ConnectedLayout>
  );
}
