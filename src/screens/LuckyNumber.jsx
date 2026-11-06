import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import ConnectedLayout from '../components/ConnectedLayout.jsx';
import StakeSelector from '../components/StakeSelector.jsx';
import BottomSheet from '../components/BottomSheet.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { db, functions } from '../lib/firebase.js';
import { formatFcfa } from '../lib/format.js';
import { walletFromProfile } from '../lib/wallet.js';
import { useStakeLimits } from '../lib/stakeLimits.js';

// Mise minimum et maximum : lues dans l'admin (valeurs de départ en attendant).
const STAKE = { min: 100, max: 1000, default: 100, step: 100, chips: [100, 500, 1000] };
const LUCKY_PICK = 5;
const PAYOUT_TABLE = [
  { matches: 2, label: '2 bons numéros', gain: '2x la mise' },
  { matches: 3, label: '3 bons numéros', gain: '10x la mise' },
  { matches: 4, label: '4 bons numéros', gain: '100x la mise' },
  { matches: 5, label: '5 bons numéros', gain: '1 000 000 FCFA' },
];

// Compte à rebours jusqu'au tirage (HH:MM:SS).
function countdown(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const pad = (value) => String(value).padStart(2, '0');
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
}

// Écran Lucky Number : 5 numéros sur 50, tirage toutes les 15 minutes (maquette 13).
export default function LuckyNumber() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const wallet = walletFromProfile(profile);
  const available = wallet.deposit + wallet.bonus;

  const [state, setState] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [stake, setStake] = useState(STAKE.default);
  const [picked, setPicked] = useState([]);
  const [now, setNow] = useState(Date.now());
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [payoutOpen, setPayoutOpen] = useState(false);

  const loadState = useCallback(() => {
    functions
      .httpsCallable('getLuckyNumberState')({})
      .then(({ data }) => setState(data))
      .catch((err) => setLoadError(err?.message || 'Jeu indisponible.'));
  }, []);

  useEffect(() => {
    loadState();
  }, [loadState]);

  // Écoute en direct : dès qu'un tirage se ferme ou s'ouvre, l'état est rechargé sans action de l'utilisateur.
  useEffect(() => {
    const unsubscribeDraw = db
      .collection('wy_lucky_draws')
      .where('status', '==', 'open')
      .limit(1)
      .onSnapshot(() => loadState(), () => {});
    const unsubscribeSettings = db
      .collection('wy_settings')
      .doc('lucky-number')
      .onSnapshot(() => loadState(), () => {});
    return () => {
      unsubscribeDraw();
      unsubscribeSettings();
    };
  }, [loadState]);

  // Horloge : met à jour le compte à rebours, et recharge l'état au moment du tirage.
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Une seule relance par tirage : si le tirage n'a pas encore eu lieu, on ne recharge pas en boucle.
  const reloadedFor = useRef(null);
  useEffect(() => {
    if (state && now >= state.drawAt && reloadedFor.current !== state.drawId) {
      reloadedFor.current = state.drawId;
      loadState();
    }
  }, [now, state, loadState]);

  const remaining = state ? state.drawAt - now : 0;
  const limits = useStakeLimits('lucky-number', { minStake: STAKE.min, maxStake: STAKE.max });
  const MIN = limits.minStake;
  const MAX = limits.maxStake;
  const chips = STAKE.chips.filter((value) => value >= MIN && value <= MAX);

  // Si l'admin change les limites, la mise affichée se recale dans la nouvelle plage.
  useEffect(() => {
    setStake((current) => Math.min(MAX, Math.max(MIN, current)));
  }, [MIN, MAX]);

  const canPlay = !submitting && picked.length === 5 && stake >= MIN && stake <= Math.min(available, MAX);
  // Une participation par tirage : une fois engagé, on n'affiche plus les choix de jeu.
  const alreadyPlayed = state ? state.myBets.length > 0 : false;

  function togglePick(number) {
    setError('');
    setMessage('');
    setPicked((current) => {
      if (current.includes(number)) return current.filter((value) => value !== number);
      if (current.length >= 5) return current;
      return [...current, number].sort((a, b) => a - b);
    });
  }

  async function play() {
    if (!canPlay) return;
    setError('');
    setMessage('');
    setSubmitting(true);
    try {
      // Pas de message : la carte « Votre participation » montre le pari.
      await functions.httpsCallable('playLuckyNumber')({ stake, numbers: picked });
      setPicked([]);
      loadState();
    } catch (err) {
      setError(err?.message || 'Pari impossible. Réessayez.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ConnectedLayout>
      <button type="button" className="back-button" onClick={() => navigate('/jeux')} aria-label="Retour aux jeux">
        ‹
      </button>

      <div className="game-title">
        <h1 className="title-font">3. Lucky Number</h1>
        <p>Prochain tirage à {state ? new Date(state.drawAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '…'}</p>
      </div>

      {loadError && <p className="error" role="alert">{loadError}</p>}

      {state && (
        <>
          <div className="game-split">
          {!alreadyPlayed && (
          <section className="lucky-card">
            <div className="stake-head">
              <span>Vos numéros</span>
              <small>{picked.length} / 5</small>
            </div>
            <div className="slots">
              {Array.from({ length: LUCKY_PICK }, (_, index) => (
                <span key={index} className={`slot${picked[index] ? ' is-filled' : ''}`}>
                  {picked[index] ?? ''}
                </span>
              ))}
            </div>
            <div className="number-grid">
              {Array.from({ length: state.pool }, (_, index) => index + 1).map((number) => (
                <button
                  type="button"
                  key={number}
                  className={`number-cell${picked.includes(number) ? ' is-picked' : ''}`}
                  onClick={() => togglePick(number)}
                  aria-pressed={picked.includes(number)}
                >
                  {number}
                </button>
              ))}
            </div>
          </section>
          )}

          {!alreadyPlayed && <StakeSelector
            stake={stake}
            onChange={setStake}
            available={available}
            min={MIN}
            max={MAX}
            step={STAKE.step}
            chips={chips}
            disabled={submitting}
          />}
          </div>

          {alreadyPlayed && (
            <section className="participation-card" aria-label="Votre participation">
              <div className="participation-head">
                <span className="participation-tag">Votre participation</span>
                <span className="participation-status">En attente du tirage</span>
              </div>

              <div className="participation-main">
                <div>
                  <small>Tirage {state.drawNumber ? `#${state.drawNumber}` : ''}</small>
                  <strong>
                    à {new Date(state.drawAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                  </strong>
                </div>
                <div className="participation-countdown">
                  <small>Résultat dans</small>
                  <b>{countdown(remaining)}</b>
                </div>
              </div>

              <ul className="bet-list">
                {state.myBets.map((bet, index) => (
                  <li key={index} className="bet-item">
                    <div className="bet-balls">
                      {bet.numbers.map((number) => (
                        <span key={number} className="mini-ball is-pick">{number}</span>
                      ))}
                    </div>
                    <small>Mise {formatFcfa(bet.stake)}</small>
                  </li>
                ))}
              </ul>

              <p className="participation-foot">
                Les numéros tirés et votre résultat s'afficheront ici dès la fin du tirage.
              </p>
            </section>
          )}


          {error && <p className="error" role="alert">{error}</p>}
          {message && <p className="hint" role="status">{message}</p>}

          {!alreadyPlayed && (
            <button type="button" className="btn btn-blue" onClick={play} disabled={!canPlay}>
              Jouer le prochain tirage
              <small>dans {countdown(remaining)}</small>
            </button>
          )}

          <button type="button" className="payout-link" onClick={() => setPayoutOpen(true)}>
            <span>Table des gains et calcul des gains</span>
            <span aria-hidden="true">›</span>
          </button>

          {state.history.length > 0 && (
            <>
              <h2 className="section-title">Historique de mes tirages</h2>
            <ul className="history-list">
              {state.history.map((item) => {
                const net = item.payout - item.stake;
                return (
                  <li key={`${item.drawId}-${item.settledAt}`} className={`history-item ${net >= 0 ? 'is-win' : 'is-loss'}`}>
                    <div className="history-head">
                      <small>
                        {item.drawNumber ? `Tirage #${item.drawNumber} · ` : ''}
                        {item.settledAt
                          ? new Date(item.settledAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
                          : ''}
                      </small>
                      <div className="history-amount">
                        <div className="history-foot">
                          <span>{item.matches} bon{item.matches > 1 ? 's' : ''} numéro{item.matches > 1 ? 's' : ''}</span>
                          <span>mise {formatFcfa(item.stake)}</span>
                        </div>
                        <span className={`history-net ${net >= 0 ? 'positive' : 'negative'}`}>
                          {net >= 0 ? '+' : '−'}
                          {formatFcfa(Math.abs(net))}
                        </span>
                      </div>
                    </div>
                    <div className="history-row">
                      <span className="history-label">Vos numéros</span>
                      <div className="history-balls">
                        {item.numbers.map((number) => (
                          <span key={number} className={`mini-ball${item.drawNumbers.includes(number) ? ' is-hit' : ''}`}>
                            {number}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="history-row">
                      <span className="history-label">Tirés</span>
                      <div className="history-balls">
                        {item.drawNumbers.map((number) => (
                          <span key={number} className="mini-ball is-drawn">{number}</span>
                        ))}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
            </>
          )}

          {state.recentDraws.length > 0 && (
            <>
              <h2 className="section-title">Derniers tirages</h2>
            <ul className="history-list">
              {state.recentDraws.map((draw) => (
                <li key={draw.drawId} className="history-item">
                  <div className="history-head">
                    <small>{draw.number ? `Tirage #${draw.number} · ` : ''}{new Date(draw.closedAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</small>
                  </div>
                  <div className="history-balls">
                    {draw.numbers.map((number) => (
                      <span key={number} className="mini-ball is-drawn">{number}</span>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
            </>
          )}
        </>
      )}
      <BottomSheet open={payoutOpen} title="Table des gains" onClose={() => setPayoutOpen(false)}>
        <p className="note">
          Votre gain = votre mise × le multiplicateur de la ligne correspondant à vos bons numéros.
        </p>
        <ul className="payout-list">
          {PAYOUT_TABLE.map((row) => (
            <li key={row.matches}>
              <span className={`match-badge m${row.matches}`}>{row.matches}</span>
              <span className="payout-label">{row.label}</span>
              <b className="gold">{row.gain}</b>
            </li>
          ))}
        </ul>
        <p className="note">
          Exemple : une mise de 500 FCFA avec 3 bons numéros rapporte 5 000 FCFA (10x).
          Le gros lot est fixe : 1 000 000 FCFA, quelle que soit la mise.
        </p>
      </BottomSheet>
    </ConnectedLayout>
  );
}
