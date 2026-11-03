import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MOCK_WALLET, WITHDRAW_AMOUNTS } from '../mock/wallet.js';
import { formatFcfa } from '../lib/format.js';

const MIN_WITHDRAWAL = 1000;
const WITHDRAW_OPERATORS = [
  { id: 'tmoney', label: 'T-Money', short: 'TMo', color: '#f5c518', phone: '+228 90 •• •• 56' },
  { id: 'flooz', label: 'Flooz (Moov)', short: 'Fl', color: '#2aa8e0', phone: '+228 96 •• •• 12' },
];

// Écran 09 : Retrait (montant, opérateur, frais, délai).
export default function Withdraw() {
  const navigate = useNavigate();
  const [operatorId, setOperatorId] = useState('flooz');
  const [amount, setAmount] = useState(15000);

  const canSubmit = amount >= MIN_WITHDRAWAL && amount <= MOCK_WALLET.withdrawable;

  return (
    <main className="app-shell screen-page">
      <div className="topbar">
        <button type="button" className="back-button" onClick={() => navigate(-1)} aria-label="Retour">‹</button>
        <h1 className="title-font">Retrait</h1>
      </div>

      <section className="withdraw-card">
        <div>
          <small>Montant retirable</small>
          <div className="balance-amount">
            {formatFcfa(MOCK_WALLET.withdrawable, { unit: false })} <span>FCFA</span>
          </div>
        </div>
        <span className="badge">Min. {formatFcfa(MIN_WITHDRAWAL, { unit: false })}</span>
      </section>

      <h2 className="step-title">Vers</h2>
      <div className="radio-list">
        {WITHDRAW_OPERATORS.map((o) => (
          <label key={o.id} className={`radio-card${operatorId === o.id ? ' is-selected' : ''}`}>
            <input
              type="radio"
              name="operator"
              value={o.id}
              checked={operatorId === o.id}
              onChange={() => setOperatorId(o.id)}
            />
            <span className="method-badge" style={{ background: o.color }}>{o.short}</span>
            <div>
              <strong>{o.label}</strong>
              <small>{o.phone}</small>
            </div>
            <span className="radio-dot" aria-hidden="true" />
          </label>
        ))}
      </div>

      <h2 className="step-title">Montant</h2>
      <div className="amount-field">
        <input
          inputMode="numeric"
          aria-label="Montant du retrait"
          value={amount}
          onChange={(e) => setAmount(Number(e.target.value.replace(/\D/g, '')) || 0)}
        />
        <span>FCFA</span>
      </div>
      <div className="chips">
        {[...WITHDRAW_AMOUNTS, 'all'].map((value) =>
          value === 'all' ? (
            <button
              type="button"
              key="all"
              className={`chip${amount === MOCK_WALLET.withdrawable ? ' is-selected' : ''}`}
              onClick={() => setAmount(MOCK_WALLET.withdrawable)}
            >
              Tout
            </button>
          ) : (
            <button
              type="button"
              key={value}
              className={`chip${amount === value ? ' is-selected' : ''}`}
              onClick={() => setAmount(value)}
            >
              {formatFcfa(value, { unit: false })}
            </button>
          )
        )}
      </div>

      <div className="summary">
        <div className="summary-row"><span>Frais</span><b>0 FCFA</b></div>
        <div className="summary-row"><span>Vous recevez</span><b className="positive">{formatFcfa(amount)}</b></div>
        <div className="summary-row"><span>Délai</span><b>moins de 15 min</b></div>
      </div>

      <button type="button" className="btn btn-primary" disabled={!canSubmit}>
        Retirer {formatFcfa(amount)}
      </button>

      <p className="note">
        🪪 Au-delà de 50 000 FCFA par jour, une vérification d'identité est demandée.
      </p>
    </main>
  );
}
