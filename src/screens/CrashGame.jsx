import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ConnectedLayout from '../components/ConnectedLayout.jsx';
import StakeSelector from '../components/StakeSelector.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { functions } from '../lib/firebase.js';
import { formatFcfa } from '../lib/format.js';
import { walletFromProfile } from '../lib/wallet.js';

// Valeurs de repli, le temps que l'état du jeu arrive. Les vraies valeurs viennent de wy_settings/crash.
const FALLBACK_CONFIG = {
  enabled: true,
  minStake: 100,
  maxStake: 10000,
  stakeChips: [100, 500, 1000, 2000, 5000, 10000],
  bettingSeconds: 10,
  maxMultiplier: 100,
  minAutoCashout: 1.01,
};
const POLL_MS = 1500; // rafraîchissement de l'état de la manche
const AUTO_STEP = 0.1;
const CHART = { width: 600, height: 300, pad: 32 };

const multiplierLabel = (value) => `${value.toFixed(2)}x`;
const floor2 = (value) => Math.floor(value * 100) / 100;

// Points de la courbe de 0 au temps écoulé : m(t) = e^(growthRate × t).
function curvePoints(growthRate, seconds) {
  const steps = Math.min(400, Math.max(2, Math.ceil(seconds * 10)));
  return Array.from({ length: steps + 1 }, (_, index) => {
    const t = (seconds * index) / steps;
    return { t, m: Math.exp(growthRate * t) };
  });
}

// Classe de couleur d'un multiplicateur crashé dans l'historique.
const crashTone = (value) => (value < 2 ? 'is-low' : value < 10 ? 'is-mid' : 'is-high');

// Courbe du multiplicateur, avec axes. Le trait s'arrête au multiplicateur courant.
function CrashChart({ growthRate, seconds, current }) {
  const { width, height, pad } = CHART;
  const tMax = Math.max(10, seconds * 1.15);
  const mMax = Math.max(2, current * 1.2);
  const x = (t) => pad + (t / tMax) * (width - pad * 2);
  const y = (m) => height - pad - ((m - 1) / (mMax - 1)) * (height - pad * 2);
  const points = curvePoints(growthRate, seconds);
  const path = points.map((p, index) => `${index === 0 ? 'M' : 'L'}${x(p.t).toFixed(1)} ${y(p.m).toFixed(1)}`).join(' ');
  const tip = points[points.length - 1];

  return (
    <svg className="crash-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Courbe du multiplicateur">
      {[1, (1 + mMax) / 2, mMax].map((value) => (
        <g key={`m-${value}`}>
          <line x1={pad} x2={width - pad} y1={y(value)} y2={y(value)} className="crash-grid" />
          <text x={pad - 6} y={y(value) + 4} className="crash-axis" textAnchor="end">{value.toFixed(1)}x</text>
        </g>
      ))}
      {[0, tMax / 2, tMax].map((value) => (
        <text key={`t-${value}`} x={x(value)} y={height - 8} className="crash-axis" textAnchor="middle">
          {Math.round(value)}s
        </text>
      ))}
      <path d={path} className="crash-curve" />
      <circle cx={x(tip.t)} cy={y(tip.m)} r="5" className="crash-tip" />
    </svg>
  );
}

// Écran Crash : une manche commune. Le multiplicateur monte, il faut encaisser avant l'explosion (maquette Crash).
export default function CrashGame() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const wallet = walletFromProfile(profile);
  const available = wallet.deposit + wallet.bonus;

  const [view, setView] = useState(null);
  const [lastCrash, setLastCrash] = useState(null); // { roundId, crashPoint, myBet, at }
  const [loadError, setLoadError] = useState('');
  const [offset, setOffset] = useState(0); // écart entre l'horloge du serveur et celle de l'appareil
  const [clock, setClock] = useState(Date.now());
  const [stake, setStake] = useState(1000);
  const [autoOn, setAutoOn] = useState(false);
  const [autoCashout, setAutoCashout] = useState(2);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const viewRef = useRef(null);
  viewRef.current = view;

  // Une manche explosée est demandée une fois, puis on passe à la manche en cours.
  const refresh = useCallback(async () => {
    const current = viewRef.current;
    const requested = current && current.status !== 'crashed' ? current.roundId : null;
    try {
      const { data } = await functions.httpsCallable('getCrashState')(requested ? { roundId: requested } : {});
      setOffset(data.serverNow - Date.now());
      if (data.status === 'crashed') {
        setLastCrash({ roundId: data.roundId, crashPoint: data.crashPoint, myBet: data.myBet, at: Date.now() });
      }
      setView(data);
      setLoadError('');
    } catch (err) {
      setLoadError(err?.message || 'Jeu indisponible pour le moment.');
    }
  }, []);

  useEffect(() => {
    refresh();
    const poll = setInterval(refresh, POLL_MS);
    return () => clearInterval(poll);
  }, [refresh]);

  useEffect(() => {
    const tick = setInterval(() => setClock(Date.now()), 100);
    return () => clearInterval(tick);
  }, []);

  const config = view?.config || FALLBACK_CONFIG;
  const serverNow = clock + offset;
  const myBet = view?.myBet || null;

  // Multiplicateur affiché : calculé localement entre deux rafraîchissements, fixé au point de crash après l'explosion.
  let seconds = 0;
  let current = 1;
  if (view?.status === 'flying') {
    seconds = Math.max(0, (serverNow - view.startedAt) / 1000);
    current = floor2(Math.exp(view.growthRate * seconds));
  } else if (view?.status === 'crashed') {
    seconds = Math.log(view.crashPoint) / view.growthRate;
    current = view.crashPoint;
  }
  const countdown = view?.status === 'betting' ? Math.max(0, Math.ceil((view.startedAt - serverNow) / 1000)) : 0;

  const canBet = view?.status === 'betting' && !myBet && config.enabled && !busy;
  const canCashout = view?.status === 'flying' && myBet?.status === 'open' && !busy;
  const crashBanner = lastCrash && Date.now() - lastCrash.at < 4000 ? lastCrash : null;

  async function placeBet() {
    setBusy(true);
    setMessage('');
    try {
      await functions.httpsCallable('playCrash')({ stake, autoCashout: autoOn ? autoCashout : null });
      await refresh();
    } catch (err) {
      setMessage(err?.message || 'Pari impossible. Réessayez.');
    } finally {
      setBusy(false);
    }
  }

  async function cashout() {
    setBusy(true);
    setMessage('');
    try {
      const { data } = await functions.httpsCallable('cashoutCrash')({ roundId: view.roundId });
      setMessage(`Retrait à ${multiplierLabel(data.multiplier)} : ${formatFcfa(data.payout)}`);
      await refresh();
    } catch (err) {
      setMessage(err?.message || 'Retrait impossible.');
    } finally {
      setBusy(false);
    }
  }

  function stepAuto(delta) {
    const next = floor2(autoCashout + delta);
    setAutoCashout(Math.min(config.maxMultiplier, Math.max(config.minAutoCashout, next)));
  }

  const players = view?.players || [];
  const recent = view?.recentCrashes || [];
  const potential = autoOn ? formatFcfa(Math.floor(stake * autoCashout)) : '—';

  let statusText = 'Mise ouverte';
  if (view?.status === 'betting') statusText = `Départ dans ${countdown}s`;
  if (view?.status === 'flying') statusText = 'Le multiplicateur monte';
  if (view?.status === 'crashed') statusText = 'Manche terminée';

  return (
    <ConnectedLayout>
      <button type="button" className="back-button" onClick={() => navigate('/jeux')} aria-label="Retour aux jeux">
        ‹
      </button>

      <div className="game-title">
        <h1 className="title-font">Crash game</h1>
        <p>Le multiplicateur augmente, retirez avant le crash !</p>
      </div>

      {loadError && <p className="error" role="alert">{loadError}</p>}

      {!view && !loadError && <p className="hint">Chargement…</p>}

      {view && (
        <div className="crash-layout">
          <section className="crash-history" aria-label="Derniers multiplicateurs">
            <small>Derniers multiplicateurs</small>
            <div className="crash-chips">
              {recent.length === 0 && <span className="note">Pas encore de manche.</span>}
              {recent.map((value, index) => (
                <span key={`${index}-${value}`} className={`crash-chip ${crashTone(value)}`}>
                  {multiplierLabel(value)}
                </span>
              ))}
            </div>
          </section>

          <section className="crash-stage">
            <div className="crash-chart-wrap">
              <CrashChart growthRate={view.growthRate || 0.06} seconds={seconds} current={current} />
              <div className={`crash-value ${view.status === 'crashed' ? 'is-crashed' : ''}`}>
                {view.status === 'betting' ? (
                  <span className="crash-countdown">{countdown}s</span>
                ) : (
                  <span>{multiplierLabel(current)}</span>
                )}
                <small>{statusText}</small>
              </div>
              {crashBanner && (
                <div className="crash-banner" role="status">
                  CRASH à {multiplierLabel(crashBanner.crashPoint)}
                  {crashBanner.myBet && crashBanner.myBet.status === 'lost' && ' · mise perdue'}
                  {crashBanner.myBet && crashBanner.myBet.status === 'cashed' && ` · gain ${formatFcfa(crashBanner.myBet.payout)}`}
                </div>
              )}
            </div>

            <button
              type="button"
              className={`btn crash-action ${canCashout ? 'btn-cashout' : 'btn-bet'}`}
              onClick={canCashout ? cashout : placeBet}
              disabled={!canBet && !canCashout}
            >
              {canCashout ? (
                <>
                  RETIRER
                  <small>{formatFcfa(Math.floor(myBet.stake * current))}</small>
                </>
              ) : myBet && myBet.status === 'open' ? (
                <>
                  EN JEU
                  <small>Mise {formatFcfa(myBet.stake)} · retrait à l'explosion ou automatique</small>
                </>
              ) : view.status === 'flying' ? (
                <>
                  MANCHE EN COURS
                  <small>Prochaine mise au prochain départ</small>
                </>
              ) : (
                <>
                  PARIER
                  <small>{busy ? 'Envoi…' : 'Démarrer le jeu'}</small>
                </>
              )}
            </button>
            {!config.enabled && <p className="hint">Le jeu est fermé pour le moment.</p>}
            {message && <p className="hint" role="status">{message}</p>}
          </section>

          <aside className="crash-controls" aria-label="Paramètres de la mise">
            <StakeSelector
              stake={stake}
              onChange={setStake}
              available={available}
              min={config.minStake}
              max={config.maxStake}
              step={100}
              chips={config.stakeChips}
              disabled={!canBet}
            />

            <section className="stake-box crash-auto">
              <div className="stake-head">
                <span>Retrait automatique</span>
                <label className="switch">
                  <input type="checkbox" checked={autoOn} disabled={!canBet} onChange={(event) => setAutoOn(event.target.checked)} />
                  <span aria-hidden="true" />
                </label>
              </div>
              <div className="stepper">
                <button type="button" disabled={!autoOn || !canBet} onClick={() => stepAuto(-AUTO_STEP)} aria-label="Diminuer le retrait automatique">−</button>
                <strong>{multiplierLabel(autoCashout)}</strong>
                <button type="button" disabled={!autoOn || !canBet} onClick={() => stepAuto(AUTO_STEP)} aria-label="Augmenter le retrait automatique">+</button>
              </div>
              <p className="note">Gain possible : {potential}</p>
            </section>
          </aside>

          <section className="stake-box crash-players">
              <div className="stake-head">
                <span>Joueurs en cours</span>
                <small>{players.length}</small>
              </div>
              {players.length === 0 ? (
                <p className="note">Aucune mise sur cette manche.</p>
              ) : (
                <table className="crash-table">
                  <thead>
                    <tr>
                      <th>Joueur</th>
                      <th>Mise</th>
                      <th>Retrait</th>
                      <th>Gain</th>
                    </tr>
                  </thead>
                  <tbody>
                    {players.map((player, index) => {
                      const net = player.payout == null ? null : player.payout - player.stake;
                      return (
                        <tr key={`${player.name}-${index}`} className={player.isMe ? 'is-me' : ''}>
                          <td>{player.name || 'Joueur'}</td>
                          <td>{formatFcfa(player.stake, { unit: false })}</td>
                          <td>
                            {player.status === 'open'
                              ? player.autoCashout
                                ? `auto ${multiplierLabel(player.autoCashout)}`
                                : '—'
                              : player.status === 'lost'
                                ? 'crash'
                                : multiplierLabel(player.multiplier)}
                          </td>
                          <td className={net == null ? '' : net >= 0 ? 'positive' : 'negative'}>
                            {net == null ? '—' : formatFcfa(net, { unit: false })}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
          </section>
        </div>
      )}
    </ConnectedLayout>
  );
}
