import { useNavigate } from 'react-router-dom';
import { IoNotificationsOutline, IoRibbonOutline } from 'react-icons/io5';
import { useAuth } from '../context/AuthContext.jsx';
import ConnectedLayout from '../components/ConnectedLayout.jsx';
import VerificationBanner from '../components/VerificationBanner.jsx';
import { MOCK_WALLET, JACKPOT } from '../mock/wallet.js';
import { formatFcfa } from '../lib/format.js';

// Écran 05 : Accueil connecté (solde, choix Jeux ou Sport, jackpot).
export default function Home() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const firstName = profile?.fullName?.split(' ')[0] || 'Kossi';

  return (
    <ConnectedLayout>
      <VerificationBanner />

      <div className="greeting">
        <div>
          <small>Bonjour</small>
          <strong>{firstName} 👋</strong>
        </div>
        <span className="bell" aria-hidden="true"><IoNotificationsOutline size={22} /></span>
      </div>

      <section className="balance-card">
        <div>
          <small>Mon solde</small>
          <div className="balance-amount">
            {formatFcfa(MOCK_WALLET.balance, { unit: false })} <span>FCFA</span>
          </div>
          <small>
            Bonus : <b className="gold">{formatFcfa(MOCK_WALLET.bonus, { unit: false })}</b>
          </small>
        </div>
        <div className="balance-actions">
          <button type="button" className="btn btn-primary btn-small" onClick={() => navigate('/depot')}>
            + Dépôt
          </button>
          <button type="button" className="btn btn-outline btn-small" onClick={() => navigate('/retrait')}>
            Retrait
          </button>
        </div>
      </section>

      <h2 className="section-label">Que voulez-vous faire ?</h2>

      <button type="button" className="univers-tile univers-tile--jeux" onClick={() => navigate('/jeux')}>
        <div>
          <strong className="title-font">Jeux</strong>
          <span>Lucky Spin · Mystery Box · Lucky Number · Jackpot</span>
        </div>
        <span className="tile-art" aria-hidden="true">🎰</span>
        <span className="tile-arrow" aria-hidden="true">›</span>
      </button>

      <button type="button" className="univers-tile univers-tile--sport" onClick={() => navigate('/sport')}>
        <div>
          <strong className="title-font">Sport</strong>
          <span className="live-badge">● 12 matchs en direct</span>
          <span>Foot, basket, tennis</span>
        </div>
        <span className="tile-art" aria-hidden="true">⚽</span>
        <span className="tile-arrow" aria-hidden="true">›</span>
      </button>

      <div className="jackpot-strip">
        <span className="jackpot-icon" aria-hidden="true"><IoRibbonOutline size={26} /></span>
        <div>
          <small>Jackpot du jour</small>
          <strong>{formatFcfa(JACKPOT.amount)}</strong>
        </div>
        <div className="jackpot-draw">
          <small>Tirage</small>
          <strong>{JACKPOT.draw}</strong>
        </div>
      </div>
    </ConnectedLayout>
  );
}
