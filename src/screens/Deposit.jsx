import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PAYMENT_METHODS, DEPOSIT_AMOUNTS } from '../mock/wallet.js';
import { formatFcfa } from '../lib/format.js';

// Écran 07 : Dépôt (moyen de paiement, montant, numéro, bonus).
export default function Deposit() {
  const navigate = useNavigate();
  const [methodId, setMethodId] = useState('tmoney');
  const [amount, setAmount] = useState(5000);
  const [number, setNumber] = useState('90 12 34 56');

  const method = PAYMENT_METHODS.find((m) => m.id === methodId);
  const canSubmit = amount >= 1000 && number.replace(/\D/g, '').length === 8;
  const bonus = Math.min(amount, 10000);

  function handleSubmit(event) {
    event.preventDefault();
    if (canSubmit) navigate('/depot/succes', { state: { amount, method: method.label } });
  }

  return (
    <main className="app-shell screen-page">
      <div className="topbar">
        <button type="button" className="back-button" onClick={() => navigate(-1)} aria-label="Retour">‹</button>
        <h1 className="title-font">Dépôt</h1>
      </div>

      <form onSubmit={handleSubmit} className="screen-form">
        <h2 className="step-title">1. Moyen de paiement</h2>
        <div className="radio-list">
          {PAYMENT_METHODS.map((m) => (
            <label key={m.id} className={`radio-card${methodId === m.id ? ' is-selected' : ''}`}>
              <input
                type="radio"
                name="method"
                value={m.id}
                checked={methodId === m.id}
                onChange={() => setMethodId(m.id)}
              />
              <span className="method-badge" style={{ background: m.color }}>{m.short}</span>
              <strong>{m.label}</strong>
              <span className="radio-dot" aria-hidden="true" />
            </label>
          ))}
        </div>

        <h2 className="step-title">2. Montant</h2>
        <div className="amount-field">
          <input
            inputMode="numeric"
            aria-label="Montant du dépôt"
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value.replace(/\D/g, '')) || 0)}
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

        <label className="field-label" htmlFor="deposit-number">Numéro {method.label.split(' ')[0]}</label>
        <div className="field">
          <span className="prefix">+228</span>
          <span className="field-divider" aria-hidden="true" />
          <input
            id="deposit-number"
            inputMode="tel"
            value={number}
            onChange={(e) => setNumber(e.target.value)}
          />
        </div>

        <div className="summary">
          <div className="summary-row"><span>Frais</span><b className="positive">Gratuit</b></div>
          <div className="summary-row"><span>Bonus 100 %</span><b className="gold">+{formatFcfa(bonus, { unit: false })} FCFA</b></div>
        </div>

        <button type="submit" className="btn btn-primary" disabled={!canSubmit}>
          Déposer {formatFcfa(amount)}
        </button>

        <p className="note">
          📱 Vous allez recevoir une demande de confirmation sur votre téléphone. Validez-la avec votre code secret.
        </p>
      </form>
    </main>
  );
}
