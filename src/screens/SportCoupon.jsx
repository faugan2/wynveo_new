import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ConnectedLayout from '../components/ConnectedLayout.jsx';
import StakeSelector from '../components/StakeSelector.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { MAX_COMBO_LEGS, useCoupon } from '../context/CouponContext.jsx';
import { functions } from '../lib/firebase.js';
import { formatFcfa } from '../lib/format.js';
import { walletFromProfile } from '../lib/wallet.js';

const STAKE = { min: 100, max: 200000, step: 500, chips: [500, 1000, 2000, 5000] };
const MAX_PAYOUT = 5000000;

// Écran coupon : choix, mode simple ou combiné, mise, gain potentiel, confirmation (maquette 17).
export default function SportCoupon() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const wallet = walletFromProfile(profile);
  const available = wallet.deposit + wallet.bonus;
  const coupon = useCoupon();
  const { selections, mode, setMode, stake, setStake, acceptChanges, setAcceptChanges, remove, updatePrices, clear, totalPrice } = coupon;

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const isCombo = mode === 'combo';
  const tickets = isCombo ? 1 : selections.length;
  const totalStake = stake * tickets;
  const potential = isCombo
    ? Math.floor(stake * totalPrice)
    : selections.reduce((sum, item) => sum + Math.floor(stake * item.price), 0);
  const overPayout = isCombo ? potential > MAX_PAYOUT : selections.some((item) => Math.floor(stake * item.price) > MAX_PAYOUT);
  const comboTooSmall = isCombo && selections.length < 2;
  const canPlace =
    !submitting && selections.length > 0 && !comboTooSmall && !overPayout && totalStake <= available && stake >= STAKE.min;

  async function placeBet() {
    setSubmitting(true);
    setError('');
    setNotice('');
    try {
      const payload = {
        mode,
        stake,
        acceptChanges,
        selections: selections.map((item) => ({ eventId: item.eventId, pick: item.pick, price: item.price })),
      };
      const { data } = await functions.httpsCallable('playSport')(payload);
      clear();
      navigate('/sport/confirme', { state: { result: data } });
    } catch (err) {
      // Le SDK renvoie le code sous la forme « functions/aborted ».
      const code = String(err?.code || '').replace('functions/', '');
      if (code === 'aborted' && err.details?.changes) {
        updatePrices(err.details.changes);
        setNotice('Les cotes ont changé. Vérifiez les nouvelles cotes, puis confirmez.');
      } else {
        setError(err?.message || 'Pari impossible. Réessayez.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (selections.length === 0) {
    return (
      <ConnectedLayout>
        <button type="button" className="back-button" onClick={() => navigate('/sport')} aria-label="Retour">‹</button>
        <h1 className="title-font page-title">Mon coupon</h1>
        <p className="note">Votre coupon est vide. Ajoutez un choix depuis les matchs.</p>
      </ConnectedLayout>
    );
  }

  return (
    <ConnectedLayout>
      <button type="button" className="back-button" onClick={() => navigate('/sport')} aria-label="Retour">‹</button>
      <div className="coupon-head">
        <h1 className="title-font page-title">Mon coupon</h1>
        <button type="button" className="link-button" onClick={clear}>Tout effacer</button>
      </div>

      <div className="segmented" role="tablist">
        <button type="button" role="tab" aria-selected={!isCombo} className={!isCombo ? 'is-active' : ''} onClick={() => setMode('single')}>
          Simple
        </button>
        <button type="button" role="tab" aria-selected={isCombo} className={isCombo ? 'is-active' : ''} onClick={() => setMode('combo')}>
          Combiné
        </button>
      </div>
      {isCombo && <p className="note">Un combiné compte de 2 à {MAX_COMBO_LEGS} choix, un par match.</p>}

      <ul className="coupon-list">
        {selections.map((item) => (
          <li key={`${item.eventId}-${item.pick}`} className="coupon-item">
            <button type="button" className="coupon-remove" onClick={() => remove(item.eventId)} aria-label="Retirer ce choix">×</button>
            <div className="coupon-item-body">
              <strong>{item.label}</strong>
              <small>{item.homeTeam} – {item.awayTeam}</small>
            </div>
            <b className="coupon-price">{item.price.toFixed(2)}</b>
          </li>
        ))}
      </ul>

      {isCombo && (
        <section className="coupon-total">
          <span>Cote totale</span>
          <strong>{totalPrice.toFixed(2)}</strong>
        </section>
      )}

      <StakeSelector
        stake={stake}
        onChange={setStake}
        available={available}
        min={STAKE.min}
        max={STAKE.max}
        step={STAKE.step}
        chips={STAKE.chips}
        disabled={submitting}
      />

      <section className="summary">
        <div className="summary-row">
          <span>Solde</span>
          <b>{formatFcfa(available)}</b>
        </div>
        <div className="summary-row">
          <span>Mise totale</span>
          <b>{formatFcfa(totalStake)}</b>
        </div>
        <div className="summary-row">
          <span>Gain potentiel</span>
          <b className="positive">{formatFcfa(potential)}</b>
        </div>
      </section>

      {overPayout && <p className="error" role="alert">Gain maximum de {formatFcfa(MAX_PAYOUT)} dépassé : réduisez la mise.</p>}
      {comboTooSmall && <p className="hint">Ajoutez au moins un autre match pour un combiné.</p>}
      {totalStake > available && <p className="hint">Solde insuffisant pour ce coupon.</p>}
      {notice && <p className="hint" role="status">{notice}</p>}
      {error && <p className="error" role="alert">{error}</p>}

      <label className="toggle-row">
        <span>Accepter les changements de cote</span>
        <input type="checkbox" checked={acceptChanges} onChange={(event) => setAcceptChanges(event.target.checked)} />
      </label>

      <button type="button" className="btn btn-sport coupon-submit" onClick={placeBet} disabled={!canPlace}>
        {submitting ? 'Envoi…' : `Placer le pari · ${formatFcfa(totalStake, { unit: false })} FCFA`}
      </button>
    </ConnectedLayout>
  );
}
