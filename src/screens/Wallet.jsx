import { useNavigate } from 'react-router-dom';
import ConnectedLayout from '../components/ConnectedLayout.jsx';
import { MOCK_WALLET, PAYMENT_METHODS, OPERATIONS } from '../mock/wallet.js';
import { formatFcfa } from '../lib/format.js';

// Écran 06 : Portefeuille (solde, bonus, moyens de paiement, dernières opérations).
export default function Wallet() {
  const navigate = useNavigate();
  const progress = Math.min(100, Math.round((MOCK_WALLET.bonus / MOCK_WALLET.bonusTarget) * 100));

  return (
    <ConnectedLayout>
      <section className="wallet-card">
        <small>Solde disponible · Jeux & Sport</small>
        <div className="balance-amount big">
          {formatFcfa(MOCK_WALLET.balance, { unit: false })} <span>FCFA</span>
        </div>
        <small>
          Retirable : <b className="gold">{formatFcfa(MOCK_WALLET.withdrawable, { unit: false })}</b> · Bonus :{' '}
          <b className="gold">{formatFcfa(MOCK_WALLET.bonus, { unit: false })}</b>
        </small>
        <div className="wallet-actions">
          <button type="button" className="btn btn-primary btn-small" onClick={() => navigate('/depot')}>
            + Déposer
          </button>
          <button type="button" className="btn btn-outline btn-small" onClick={() => navigate('/retrait')}>
            Retirer
          </button>
        </div>
      </section>

      <section className="bonus-box">
        <div className="bonus-head">
          <span>Bonus de bienvenue</span>
          <b>
            {formatFcfa(MOCK_WALLET.bonus, { unit: false })} / {formatFcfa(MOCK_WALLET.bonusTarget, { unit: false })}
          </b>
        </div>
        <div className="progress" aria-hidden="true">
          <span style={{ width: `${progress}%` }} />
        </div>
        <p>
          Misez encore {formatFcfa(MOCK_WALLET.bonusRemainingBets)} (jeux ou sport) pour débloquer le bonus.
        </p>
      </section>

      <div className="section-head">
        <h2>Mes moyens de paiement</h2>
        <button type="button" className="link">+ Ajouter</button>
      </div>
      <ul className="method-list">
        {PAYMENT_METHODS.filter((m) => m.phone).map((method) => (
          <li key={method.id} className="method-item">
            <span className="method-badge" style={{ background: method.color }}>{method.short}</span>
            <div>
              <strong>{method.label}</strong>
              <small>{method.phone}{method.id === 'tmoney' ? ' · Par défaut' : ''}</small>
            </div>
          </li>
        ))}
      </ul>

      <div className="section-head">
        <h2>Dernières opérations</h2>
        <button type="button" className="link">Historique</button>
      </div>
      <ul className="op-list">
        {OPERATIONS.map((op) => (
          <li key={op.id} className="op-item">
            <div>
              <strong>{op.label}</strong>
              <small>{op.date}</small>
            </div>
            <b className={op.amount > 0 ? 'positive' : 'negative'}>
              {op.amount > 0 ? '+' : '−'}
              {formatFcfa(Math.abs(op.amount), { unit: false })}
            </b>
          </li>
        ))}
      </ul>
    </ConnectedLayout>
  );
}
