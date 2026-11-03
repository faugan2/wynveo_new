import { useNavigate } from 'react-router-dom';
import { IoHandRightOutline, IoNotificationsOutline, IoRibbonOutline } from 'react-icons/io5';
import { useAuth } from '../context/AuthContext.jsx';
import ConnectedLayout from '../components/ConnectedLayout.jsx';
import VerificationBanner from '../components/VerificationBanner.jsx';
import { formatFcfa } from '../lib/format.js';
import { formatDrawTime, useJackpotSummary } from '../lib/jackpotSummary.js';
import { useUpcomingEvents } from '../lib/sportEvents.js';
import { walletFromProfile } from '../lib/wallet.js';

// Écran 05 : Accueil connecté (solde, choix Jeux ou Sport, jackpot).
export default function Home() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const wallet = walletFromProfile(profile);
  const firstName = profile?.fullName?.split(' ')[0] ?? '';
  const jackpot = useJackpotSummary();
  const { events: sportEvents } = useUpcomingEvents();
  const liveCount = sportEvents ? sportEvents.filter((event) => event.status === 'live').length : 0;

  return (
    <ConnectedLayout>
      <VerificationBanner />

      <div className="greeting">
        <p className="greeting-line">
          Bonjour {firstName && <strong>{firstName}</strong>}{' '}
          <IoHandRightOutline className="greeting-hand" size={20} aria-hidden="true" />
        </p>
        <span className="bell" aria-hidden="true"><IoNotificationsOutline size={22} /></span>
      </div>

      <section className="balance-card">
        <div className="balance-split">
          <div>
            <small>Dépôts</small>
            <div className="balance-amount">
              {formatFcfa(wallet.deposit, { unit: false })} <span>FCFA</span>
            </div>
          </div>
          <div>
            <small>Bonus</small>
            <div className="balance-amount gold">
              {formatFcfa(wallet.bonus, { unit: false })} <span>FCFA</span>
            </div>
          </div>
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
          {liveCount > 0 && <span className="live-badge">● {liveCount} {liveCount > 1 ? 'matchs en direct' : 'match en direct'}</span>}
          <span>Ligue 1 · paris 1 N 2 et plus/moins</span>
        </div>
        <span className="tile-art" aria-hidden="true">⚽</span>
        <span className="tile-arrow" aria-hidden="true">›</span>
      </button>

      <div className="jackpot-strip">
        <span className="jackpot-icon" aria-hidden="true"><IoRibbonOutline size={26} /></span>
        <div>
          <small>Jackpot du jour</small>
          <strong>{jackpot ? formatFcfa(jackpot.pot) : '—'}</strong>
        </div>
        <div className="jackpot-draw">
          <small>Tirage</small>
          <strong>{jackpot ? formatDrawTime(jackpot.drawAt) : '—'}</strong>
        </div>
      </div>
    </ConnectedLayout>
  );
}
