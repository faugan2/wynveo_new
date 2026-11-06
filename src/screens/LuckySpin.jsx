import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ConnectedLayout from '../components/ConnectedLayout.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { functions } from '../lib/firebase.js';
import { formatFcfa } from '../lib/format.js';
import { walletFromProfile } from '../lib/wallet.js';
import { LUCKY_SPIN_SEGMENTS, LUCKY_SPIN_STAKE } from '../content/luckySpin.js';
import { multiplierLabel, useLuckySpinConfig } from '../lib/luckySpinConfig.js';

const SEGMENT_ANGLE = 360 / LUCKY_SPIN_SEGMENTS.length;
const RADIUS = 140;
const CENTER = 150;
const SPIN_MS = 4000;

// Coordonnées d'un point de la roue, angle mesuré en degrés depuis le haut, sens horaire.
function point(angle, radius) {
  const radians = (angle * Math.PI) / 180;
  return [CENTER + radius * Math.sin(radians), CENTER - radius * Math.cos(radians)];
}

// Chemin SVG d'une case (secteur).
function sectorPath(index) {
  const start = index * SEGMENT_ANGLE;
  const end = start + SEGMENT_ANGLE;
  const [x1, y1] = point(start, RADIUS);
  const [x2, y2] = point(end, RADIUS);
  return `M ${CENTER} ${CENTER} L ${x1} ${y1} A ${RADIUS} ${RADIUS} 0 0 1 ${x2} ${y2} Z`;
}

// Angle de rotation qui amène la case gagnante sous le repère (en haut).
function rotationFor(index, currentRotation) {
  const center = index * SEGMENT_ANGLE + SEGMENT_ANGLE / 2;
  const target = (((360 - center - (currentRotation % 360)) % 360) + 360) % 360;
  return currentRotation + 5 * 360 + target;
}

// Écran Lucky Spin : choix de la mise, roue, résultat (maquettes 10 et 11).
export default function LuckySpin() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const wallet = walletFromProfile(profile);
  const available = wallet.deposit + wallet.bonus;

  const [stake, setStake] = useState(LUCKY_SPIN_STAKE.default);
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  // Mise minimum et maximum, multiplicateurs : lus dans l'admin (valeurs de départ en attendant).
  const config = useLuckySpinConfig();
  const MIN = config.minStake;
  const MAX = config.maxStake;
  const segments = LUCKY_SPIN_SEGMENTS.map((segment, index) => ({
    ...segment,
    multiplier: config.multipliers[index],
    label: multiplierLabel(config.multipliers[index]),
  }));
  const chips = LUCKY_SPIN_STAKE.chips.filter((value) => value >= MIN && value <= MAX);

  // Si l'admin change les limites, la mise affichée se recale dans la nouvelle plage.
  useEffect(() => {
    setStake((current) => Math.min(MAX, Math.max(MIN, current)));
  }, [MIN, MAX]);

  const canSpin = !spinning && stake >= MIN && stake <= Math.min(available, MAX);

  function changeStake(value) {
    setStake(Math.min(MAX, Math.max(MIN, value)));
  }

  async function spin() {
    if (!canSpin) return;
    setError('');
    setSpinning(true);
    try {
      const { data } = await functions.httpsCallable('playLuckySpin')({ stake });
      setRotation((current) => rotationFor(data.segmentIndex, current));
      // Une fois la roue arrêtée, on affiche le résultat.
      setTimeout(() => {
        setResult(data);
        setSpinning(false);
      }, SPIN_MS);
    } catch (err) {
      setError(err?.message || 'Mise impossible. Réessayez.');
      setSpinning(false);
    }
  }

  return (
    <ConnectedLayout>
      <button type="button" className="back-button" onClick={() => navigate('/jeux')} aria-label="Retour aux jeux">
        ‹
      </button>

      <div className="game-title">
        <h1 className="title-font">1. Lucky Spin</h1>
        <p>Gagnez jusqu'à <b className="gold">50x</b> votre mise !</p>
      </div>

      <div className="spin-layout">
      <section className="wheel-card">
        <div className="wheel-wrap">
          <span className="wheel-pointer" aria-hidden="true" />
          <svg
            className="wheel"
            viewBox="0 0 300 300"
            role="img"
            aria-label="Roue Lucky Spin"
            style={{
              transform: `rotate(${rotation}deg)`,
              transition: spinning ? `transform ${SPIN_MS}ms cubic-bezier(0.17, 0.67, 0.12, 1)` : 'none',
            }}
          >
            {segments.map((segment, index) => {
              const [lx, ly] = point(index * SEGMENT_ANGLE + SEGMENT_ANGLE / 2, RADIUS * 0.66);
              return (
                <g key={index}>
                  <path d={sectorPath(index)} fill={segment.color} stroke="#0b0a1f" strokeWidth="2" />
                  <text
                    x={lx}
                    y={ly}
                    fill="#fff"
                    fontFamily="Barlow Condensed, sans-serif"
                    fontWeight="800"
                    fontSize="26"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    transform={`rotate(${index * SEGMENT_ANGLE + SEGMENT_ANGLE / 2} ${lx} ${ly})`}
                  >
                    {segment.label}
                  </text>
                </g>
              );
            })}
            <circle cx={CENTER} cy={CENTER} r="26" fill="#f5c518" stroke="#0b0a1f" strokeWidth="4" />
          </svg>
        </div>
      </section>

      <section className="stake-box">
        <div className="stake-head">
          <span>Montant de la mise</span>
          <small>Solde : {formatFcfa(available)}</small>
        </div>

        <div className="stepper">
          <button type="button" onClick={() => changeStake(stake - LUCKY_SPIN_STAKE.step)} aria-label="Diminuer la mise">−</button>
          <strong>{formatFcfa(stake)}</strong>
          <button type="button" onClick={() => changeStake(stake + LUCKY_SPIN_STAKE.step)} aria-label="Augmenter la mise">+</button>
        </div>

        <div className="chips">
          {chips.map((value) => (
            <button
              type="button"
              key={value}
              className={`chip${stake === value ? ' is-selected' : ''}`}
              onClick={() => setStake(value)}
            >
              {formatFcfa(value, { unit: false })}
            </button>
          ))}
        </div>

        {stake > available && <p className="hint">Solde insuffisant pour cette mise.</p>}
        {error && <p className="error" role="alert">{error}</p>}

        <button type="button" className="spin-button" onClick={spin} disabled={!canSpin}>
          {spinning ? 'La roue tourne…' : 'Tourner'}
          <small>Appuyez pour faire tourner</small>
        </button>
      </section>
      </div>

      {result && (
        <div className="result-overlay" role="dialog" aria-modal="true" aria-label="Résultat">
          <div className="result-card">
            <div className="result-emoji" aria-hidden="true">{result.multiplier >= 1 ? '🎉' : '😕'}</div>
            <h2 className="title-font">{result.multiplier >= 1 ? 'Félicitations !' : 'Pas cette fois'}</h2>
            <p className="result-sub">La roue s'est arrêtée sur</p>
            <div className="result-multiplier">
              {segments[result.segmentIndex].label}
            </div>

            <div className="summary">
              <div className="summary-row"><span>Mise</span><b>{formatFcfa(result.stake)}</b></div>
              <div className="summary-row">
                <span>Gain</span>
                <b className="positive">+{formatFcfa(result.payout, { unit: false })} FCFA</b>
              </div>
              <div className="summary-row">
                <span>Nouveau solde</span>
                <b>{formatFcfa(result.balance.real + result.balance.bonus)}</b>
              </div>
            </div>

            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setResult(null);
                spin();
              }}
              disabled={result.balance.real + result.balance.bonus < MIN}
            >
              Rejouer · {formatFcfa(stake)}
            </button>
            <button type="button" className="link result-close" onClick={() => setResult(null)}>
              Fermer
            </button>
          </div>
        </div>
      )}
    </ConnectedLayout>
  );
}
