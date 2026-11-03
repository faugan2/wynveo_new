import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ConnectedLayout from '../components/ConnectedLayout.jsx';
import StakeSelector from '../components/StakeSelector.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { functions } from '../lib/firebase.js';
import { formatFcfa } from '../lib/format.js';
import { walletFromProfile } from '../lib/wallet.js';

const STAKE = { min: 100, max: 10000, default: 1000, step: 100, chips: [1000, 2000, 5000, 10000] };
const BOX_COUNT = 9;

// Valeur affichée dans un coffre ouvert : « Vide » ou le gain possible pour cette mise.
function boxLabel(multiplier, stake) {
  if (multiplier === 0) return 'Vide';
  return formatFcfa(Math.floor(stake * multiplier), { unit: false });
}

// Écran Mystery Box : choix de la mise, 9 coffres, gain = coffre choisi (maquette 12).
export default function MysteryBox() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const wallet = walletFromProfile(profile);
  const available = wallet.deposit + wallet.bonus;

  const [stake, setStake] = useState(STAKE.default);
  const [opened, setOpened] = useState(null); // résultat du tirage, null avant le premier clic
  const [chosen, setChosen] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const canPlay = !loading && stake >= STAKE.min && stake <= Math.min(available, STAKE.max);

  async function open(index) {
    if (!canPlay || opened) return;
    setError('');
    setLoading(true);
    setChosen(index);
    try {
      const { data } = await functions.httpsCallable('playMysteryBox')({ stake, boxIndex: index });
      setOpened(data);
    } catch (err) {
      setError(err?.message || 'Partie impossible. Réessayez.');
      setChosen(null);
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setOpened(null);
    setChosen(null);
    setError('');
  }

  const won = opened && opened.payout > 0;

  return (
    <ConnectedLayout>
      <button type="button" className="back-button" onClick={() => navigate('/jeux')} aria-label="Retour aux jeux">
        ‹
      </button>

      <div className="game-title">
        <h1 className="title-font">2. Mystery Box</h1>
        <p>{opened ? 'Votre boîte est ouverte !' : 'Choisissez un coffre pour le tester.'}</p>
      </div>

      <section className="boxes-card">
        <div className="boxes-grid">
          {Array.from({ length: BOX_COUNT }, (_, index) => {
            const isOpen = Boolean(opened);
            const isChosen = chosen === index;
            const multiplier = isOpen ? opened.boxes[index] : null;
            const classes = ['box'];
            if (isChosen) classes.push('is-chosen');
            if (isOpen && multiplier === 0) classes.push('is-empty');
            if (isOpen && multiplier > 0) classes.push('is-win');

            return (
              <button
                type="button"
                key={index}
                className={classes.join(' ')}
                onClick={() => open(index)}
                disabled={isOpen || !canPlay}
                aria-label={isOpen ? `Coffre ${index + 1} : ${boxLabel(multiplier, stake)}` : `Coffre ${index + 1}`}
              >
                <span className="box-icon" aria-hidden="true">
                  {isOpen ? (multiplier > 0 ? '💰' : '📦') : '🎁'}
                </span>
                <span className="box-value">{isOpen ? boxLabel(multiplier, stake) : '?'}</span>
              </button>
            );
          })}
        </div>
      </section>

      {!opened && (
        <StakeSelector
          stake={stake}
          onChange={setStake}
          available={available}
          min={STAKE.min}
          max={STAKE.max}
          step={STAKE.step}
          chips={STAKE.chips}
          disabled={loading}
        />
      )}

      {error && <p className="error" role="alert">{error}</p>}
      {loading && <p className="hint">Ouverture…</p>}

      {opened && (
        <section className="box-result">
          <small>{won ? 'Vous gagnez' : 'Pas de gain'}</small>
          <div className={`box-result-amount ${won ? 'positive' : 'negative'}`}>
            {won ? `+${formatFcfa(opened.payout, { unit: false })} FCFA` : formatFcfa(0)}
          </div>
          <p className="note">
            Mise de {formatFcfa(opened.stake)} · multiplicateur {opened.multiplier}x
          </p>
          <div className="summary">
            <div className="summary-row">
              <span>Nouveau solde</span>
              <b>{formatFcfa(opened.balance.real + opened.balance.bonus)}</b>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-jeux"
            onClick={reset}
            disabled={opened.balance.real + opened.balance.bonus < STAKE.min}
          >
            Rejouer · {formatFcfa(stake)}
          </button>
        </section>
      )}
    </ConnectedLayout>
  );
}
