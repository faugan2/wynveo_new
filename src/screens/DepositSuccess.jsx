import { useLocation, useNavigate } from 'react-router-dom';
import { DEPOSIT_RESULT } from '../mock/wallet.js';
import { formatFcfa } from '../lib/format.js';

// Écran 08 : Dépôt réussi (montant, bonus, étapes, référence).
export default function DepositSuccess() {
  const navigate = useNavigate();
  const location = useLocation();
  const amount = location.state?.amount ?? 5000;
  const operator = location.state?.method ?? 'T-Money';

  const steps = [
    { label: `Demande envoyée à ${operator}`, time: '09:12:04' },
    { label: 'Confirmé sur votre téléphone', time: '09:12:31' },
    { label: 'Solde crédité', time: `Nouveau solde : ${formatFcfa(DEPOSIT_RESULT.newBalance)}` },
  ];

  return (
    <main className="app-shell screen-page">
      <div className="topbar">
        <button type="button" className="back-button" onClick={() => navigate('/portefeuille')} aria-label="Retour">‹</button>
        <h1 className="title-font">Dépôt</h1>
      </div>

      <div className="success-hero">
        <div className="success-check" aria-hidden="true">✓</div>
        <h2 className="title-font">Dépôt réussi</h2>
        <div className="success-amount">+{formatFcfa(amount, { unit: false })} FCFA</div>
        <small>+ {formatFcfa(DEPOSIT_RESULT.bonus, { unit: false })} FCFA de bonus de bienvenue</small>
      </div>

      <ol className="timeline">
        {steps.map((step) => (
          <li key={step.label}>
            <span className="timeline-dot" aria-hidden="true">✓</span>
            <div>
              <strong>{step.label}</strong>
              <small>{step.time}</small>
            </div>
          </li>
        ))}
      </ol>

      <dl className="details">
        <div><dt>Référence</dt><dd>{DEPOSIT_RESULT.reference}</dd></div>
        <div><dt>Opérateur</dt><dd>{DEPOSIT_RESULT.operator}</dd></div>
      </dl>

      <div className="split-buttons">
        <button type="button" className="btn btn-jeux" onClick={() => navigate('/jeux')}>🎰 Jeux</button>
        <button type="button" className="btn btn-sport" onClick={() => navigate('/sport')}>⚽ Sport</button>
      </div>
    </main>
  );
}
