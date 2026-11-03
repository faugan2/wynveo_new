import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ConnectedLayout from '../components/ConnectedLayout.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { functions } from '../lib/firebase.js';
import { formatFcfa } from '../lib/format.js';
import { walletFromProfile } from '../lib/wallet.js';

// Écran 06 : Portefeuille (solde des dépôts, retirable, dernières opérations).
// Les soldes et les opérations viennent de la base.
export default function Wallet() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const wallet = walletFromProfile(profile);

  const [operations, setOperations] = useState(null);
  const [operationsError, setOperationsError] = useState('');

  useEffect(() => {
    let active = true;
    functions
      .httpsCallable('getMyOperations')({})
      .then(({ data }) => active && setOperations(data.operations))
      .catch((err) => active && setOperationsError(err?.message || 'Opérations indisponibles.'));
    return () => {
      active = false;
    };
  }, []);

  return (
    <ConnectedLayout>
      <section className="wallet-card">
        <small>Solde des dépôts</small>
        <div className="balance-amount big">
          {formatFcfa(wallet.deposit, { unit: false })} <span>FCFA</span>
        </div>
        <span className="wallet-chip">
          Retirable <b>{formatFcfa(wallet.withdrawable, { unit: false })}</b>
        </span>
        <div className="wallet-actions">
          <button type="button" className="btn btn-primary btn-small" onClick={() => navigate('/depot')}>
            + Déposer
          </button>
          <button type="button" className="btn btn-outline btn-small" onClick={() => navigate('/retrait')}>
            Retirer
          </button>
        </div>
      </section>

      <div className="section-head">
        <h2>Dernières opérations</h2>
      </div>

      {operationsError && <p className="error" role="alert">{operationsError}</p>}
      {!operations && !operationsError && <p className="hint">Chargement…</p>}
      {operations && operations.length === 0 && (
        <p className="note">Aucune opération pour le moment.</p>
      )}
      {operations && operations.length > 0 && (
        <ul className="op-list">
          {operations.map((op) => (
            <li key={op.id} className="op-item">
              <div>
                <strong>{op.label}</strong>
                <small>
                  {op.createdAt
                    ? new Date(op.createdAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
                    : 'En cours'}
                </small>
              </div>
              <b className={op.amount >= 0 ? 'positive' : 'negative'}>
                {op.amount >= 0 ? '+' : '−'}
                {formatFcfa(Math.abs(op.amount), { unit: false })}
              </b>
            </li>
          ))}
        </ul>
      )}
    </ConnectedLayout>
  );
}
