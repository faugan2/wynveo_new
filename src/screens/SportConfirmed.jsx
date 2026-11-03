import { useLocation, useNavigate } from 'react-router-dom';
import ConnectedLayout from '../components/ConnectedLayout.jsx';
import { formatFcfa } from '../lib/format.js';

// Pari confirmé (maquette 18). Les montants viennent de la réponse de playSport.
export default function SportConfirmed() {
  const navigate = useNavigate();
  const location = useLocation();
  const result = location.state?.result;

  if (!result) {
    return (
      <ConnectedLayout>
        <p className="note">Aucun pari à afficher.</p>
        <button type="button" className="btn btn-sport" onClick={() => navigate('/sport')}>Retour au sport</button>
      </ConnectedLayout>
    );
  }

  const newBalance = result.balance.real + result.balance.bonus;

  return (
    <ConnectedLayout>
      <div className="success-hero">
        <div className="success-check" aria-hidden="true">✓</div>
        <h2 className="title-font">Pari placé !</h2>
        <p className="note">Suivez vos matchs dans Mes Paris.</p>
      </div>

      <ul className="ticket-list">
        {result.bets.map((bet) => (
          <li key={bet.id} className="ticket">
            <small>Ticket #{bet.id.slice(0, 8).toUpperCase()}</small>
            <div className="summary-row">
              <span>Cote</span>
              <b>{bet.totalPrice.toFixed(2)}</b>
            </div>
            <div className="summary-row">
              <span>Gain potentiel</span>
              <b className="positive">{formatFcfa(bet.potentialPayout)}</b>
            </div>
          </li>
        ))}
      </ul>

      <section className="summary">
        <div className="summary-row">
          <span>Mise totale</span>
          <b>{formatFcfa(result.totalStake)}</b>
        </div>
        <div className="summary-row">
          <span>Nouveau solde</span>
          <b>{formatFcfa(newBalance)}</b>
        </div>
      </section>

      <button type="button" className="btn btn-sport" onClick={() => navigate('/mes-paris')}>Voir mes paris</button>
      <button type="button" className="btn btn-outline" onClick={() => navigate('/sport')}>Continuer à parier</button>
    </ConnectedLayout>
  );
}
