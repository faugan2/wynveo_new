import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DEPOSIT_AMOUNTS } from '../mock/wallet.js';
import { formatFcfa } from '../lib/format.js';
import { ENABLED_COUNTRIES, DEFAULT_COUNTRY, buildPhone } from '../config/countries.js';
import { functions } from '../lib/firebase.js';
import CryptoDeposit from '../components/CryptoDeposit.jsx';

const MIN_DEPOSIT = 1000;
const STEP_LABELS = ['MONTANT', 'PAYS', 'CONFIRMATION'];

// Écran 07 : Dépôt en trois étapes : montant, pays, puis numéro et confirmation.
// Le moyen de paiement est choisi par Chariow sur sa page de paiement.
export default function Deposit() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [amount, setAmount] = useState(5000);
  const [country, setCountry] = useState(DEFAULT_COUNTRY);
  const [localNumber, setLocalNumber] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  // Moyen de paiement choisi : '' (à choisir), 'mobile' (Mobile Money) ou 'crypto'.
  const [method, setMethod] = useState('');

  const amountOk = amount >= MIN_DEPOSIT;
  const phone = buildPhone(country, localNumber);

  function handleBack() {
    if (method === 'mobile' && step > 1) setStep(step - 1);
    else if (method) setMethod('');
    else navigate(-1);
  }

  function handleAmountNext(event) {
    event.preventDefault();
    if (amountOk) setStep(2);
  }

  function handleCountryNext(event) {
    event.preventDefault();
    setStep(3);
  }

  // Test : crédite le solde via la fonction simulateDeposit (émulateur seulement).
  // Le vrai paiement passera par Chariow, à la place de cet appel.
  async function handlePay(event) {
    event.preventDefault();
    if (!phone || submitting) return;

    setError('');
    setSubmitting(true);
    try {
      const { data } = await functions.httpsCallable('simulateDeposit')({ amount });
      navigate('/depot/succes', { state: { amount, method: country.name, result: data } });
    } catch (err) {
      setError(err?.message || 'Dépôt impossible. Réessayez.');
      setSubmitting(false);
    }
  }

  // Premier choix : Mobile Money ou crypto.
  if (method === '') {
    return (
      <main className="app-shell screen-page">
        <div className="topbar">
          <button type="button" className="back-button" onClick={handleBack} aria-label="Retour">‹</button>
          <h1 className="title-font">Dépôt</h1>
        </div>
        <h2 className="step-title">Comment voulez-vous déposer ?</h2>
        <div className="method-choice">
          <button type="button" className="method-card" onClick={() => setMethod('mobile')}>
            <strong>Mobile Money</strong>
            <span>En FCFA, avec votre numéro de téléphone</span>
          </button>
          <button type="button" className="method-card" onClick={() => setMethod('crypto')}>
            <strong>Crypto</strong>
            <span>USDT ou USDC, depuis votre portefeuille</span>
          </button>
        </div>
      </main>
    );
  }

  if (method === 'crypto') {
    return (
      <main className="app-shell screen-page">
        <div className="topbar">
          <button type="button" className="back-button" onClick={handleBack} aria-label="Retour">‹</button>
          <h1 className="title-font">Dépôt</h1>
        </div>
        <CryptoDeposit />
      </main>
    );
  }

  return (
    <main className="app-shell screen-page">
      <div className="topbar">
        <button type="button" className="back-button" onClick={handleBack} aria-label="Retour">‹</button>
        <h1 className="title-font">Dépôt</h1>
      </div>

      <div className="step-head">
        <span>ÉTAPE {step} SUR 3 · {STEP_LABELS[step - 1]}</span>
      </div>
      <div className="progress step-progress-bar" aria-hidden="true">
        <span style={{ width: `${(step / 3) * 100}%` }} />
      </div>

      {step === 1 && (
        <form onSubmit={handleAmountNext} className="screen-form">
          <h2 className="step-title">Quel montant voulez-vous déposer ?</h2>
          <div className="amount-field">
            <input
              inputMode="numeric"
              aria-label="Montant du dépôt"
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value.replace(/\D/g, '')) || 0)}
              autoFocus
            />
            <span>FCFA</span>
          </div>
          <div className="chips">
            {DEPOSIT_AMOUNTS.map((value) => (
              <button
                type="button"
                key={value}
                className={`chip${amount === value ? ' is-selected' : ''}`}
                onClick={() => setAmount(value)}
              >
                {formatFcfa(value, { unit: false })}
              </button>
            ))}
          </div>

          <div className="summary">
            <div className="summary-row"><span>Frais</span><b className="positive">Gratuit</b></div>
          </div>

          <button type="submit" className="btn btn-primary" disabled={!amountOk}>
            Continuer
          </button>
          {!amountOk && <p className="hint">Le dépôt minimum est de {formatFcfa(MIN_DEPOSIT)}.</p>}
        </form>
      )}

      {step === 2 && (
        <form onSubmit={handleCountryNext} className="screen-form">
          <h2 className="step-title">Dans quel pays êtes-vous ?</h2>
          <div className="radio-list">
            {ENABLED_COUNTRIES.map((c) => (
              <label key={c.code} className={`radio-card${country.code === c.code ? ' is-selected' : ''}`}>
                <input
                  type="radio"
                  name="country"
                  value={c.code}
                  checked={country.code === c.code}
                  onChange={() => setCountry(c)}
                />
                <span className={`fi fi-${c.code.toLowerCase()} country-flag`} aria-hidden="true" />
                <strong>{c.name}</strong>
                <span className="country-dial">{c.dialCode}</span>
                <span className="radio-dot" aria-hidden="true" />
              </label>
            ))}
          </div>

          <button type="submit" className="btn btn-primary" style={{ marginTop: 20 }}>
            Continuer
          </button>
        </form>
      )}

      {step === 3 && (
        <form onSubmit={handlePay} className="screen-form">
          <h2 className="step-title">Vérifiez votre dépôt</h2>
          <div className="summary">
            <div className="summary-row"><span>Montant</span><b>{formatFcfa(amount)}</b></div>
            <div className="summary-row"><span>Pays</span><b>{country.name}</b></div>
            <div className="summary-row"><span>Frais</span><b className="positive">Gratuit</b></div>
          </div>

          <label className="field-label" htmlFor="deposit-number">Numéro de téléphone pour le paiement</label>
          <div className="field">
            <span className="prefix">{country.dialCode}</span>
            <span className="field-divider" aria-hidden="true" />
            <input
              id="deposit-number"
              inputMode="tel"
              value={localNumber}
              onChange={(e) => setLocalNumber(e.target.value)}
              placeholder={'• '.repeat(country.phoneLength).trim()}
            />
          </div>
          {localNumber && !phone && (
            <p className="hint">Le numéro doit comporter {country.phoneLength} chiffres.</p>
          )}

          {error && <p className="error" role="alert">{error}</p>}

          <button type="submit" className="btn btn-primary" style={{ marginTop: 20 }} disabled={!phone || submitting}>
            {submitting ? 'Dépôt en cours…' : 'Continuer vers le paiement'}
          </button>

          <p className="note">
            📱 Vous serez redirigé vers la page de paiement sécurisée. Vous y choisirez votre moyen de paiement.
          </p>
        </form>
      )}
    </main>
  );
}
