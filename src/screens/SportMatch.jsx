import { useNavigate, useParams } from 'react-router-dom';
import ConnectedLayout from '../components/ConnectedLayout.jsx';
import CouponBar from '../components/CouponBar.jsx';
import OddsButton from '../components/OddsButton.jsx';
import { useCoupon } from '../context/CouponContext.jsx';
import { isBettable, kickoffLabel, selectionFor, useEvent } from '../lib/sportEvents.js';

// Détail d'un match : marchés disponibles (1 N 2 et plus/moins 2,5), comme la maquette 16.
export default function SportMatch() {
  const navigate = useNavigate();
  const { eventId } = useParams();
  const event = useEvent(eventId);
  const { selections, toggle } = useCoupon();

  if (event === undefined) return <ConnectedLayout><p className="hint">Chargement…</p></ConnectedLayout>;
  if (event === null) {
    return (
      <ConnectedLayout>
        <button type="button" className="back-button" onClick={() => navigate('/sport')} aria-label="Retour">‹</button>
        <p className="note">Ce match n'existe plus.</p>
      </ConnectedLayout>
    );
  }

  const open = isBettable(event);
  const isPicked = (pick) => selections.some((item) => item.eventId === event.id && item.pick === pick);

  return (
    <ConnectedLayout>
      <button type="button" className="back-button" onClick={() => navigate('/sport')} aria-label="Retour">‹</button>

      <section className="match-hero">
        <small>{event.league} · {kickoffLabel(event.commenceMs)}</small>
        <div className="match-hero-teams">
          <strong>{event.homeTeam}</strong>
          <span>contre</span>
          <strong>{event.awayTeam}</strong>
        </div>
        {!open && <p className="note">Paris fermés : le match a commencé.</p>}
      </section>

      <section className="market-card">
        <h2 className="market-title">Résultat du match <span>1X2</span></h2>
        <div className="odds-row">
          <OddsButton label={event.homeTeam} price={event.odds?.home} active={isPicked('home')} disabled={!open} onClick={() => toggle(selectionFor(event, 'home'))} />
          <OddsButton label="Nul" price={event.odds?.draw} active={isPicked('draw')} disabled={!open} onClick={() => toggle(selectionFor(event, 'draw'))} />
          <OddsButton label={event.awayTeam} price={event.odds?.away} active={isPicked('away')} disabled={!open} onClick={() => toggle(selectionFor(event, 'away'))} />
        </div>
      </section>

      {event.odds?.line && (
        <section className="market-card">
          <h2 className="market-title">Total de buts <span>{event.odds.line}</span></h2>
          <div className="odds-row">
            <OddsButton label={`Plus de ${event.odds.line}`} price={event.odds.over} active={isPicked('over')} disabled={!open} onClick={() => toggle(selectionFor(event, 'over'))} />
            <OddsButton label={`Moins de ${event.odds.line}`} price={event.odds.under} active={isPicked('under')} disabled={!open} onClick={() => toggle(selectionFor(event, 'under'))} />
          </div>
        </section>
      )}

      <CouponBar />
    </ConnectedLayout>
  );
}
