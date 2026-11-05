import { useParams, useNavigate } from 'react-router-dom';
import ConnectedLayout from '../components/ConnectedLayout.jsx';
import GameCard from '../components/GameCard.jsx';
import { GAMES, GAMES_BY_SLUG } from '../content/games.js';
import { formatFcfa } from '../lib/format.js';
import { useJackpotSummary } from '../lib/jackpotSummary.js';

// Page Jeux : grille de cartes (même style que la rangée de l'accueil), avec la mise de chaque jeu.
export default function Games() {
  const jackpot = useJackpotSummary();

  return (
    <ConnectedLayout>
      <h1 className="title-font page-title">Jeux</h1>
      <p className="note">Choisissez un jeu et misez avec le solde de vos dépôts.</p>

      <ul className="game-tile-grid">
        {GAMES.map((game) => (
          <li key={game.slug}>
            <GameCard
              name={game.name}
              meta={game.slug === 'jackpot' ? `Cagnotte : ${jackpot ? formatFcfa(jackpot.pot) : '—'}` : game.stake}
              to={`/jeux/${game.slug}`}
              icon={game.icon}
              soon={Boolean(game.soon)}
            />
          </li>
        ))}
      </ul>
    </ConnectedLayout>
  );
}

// Page provisoire d'un jeu : le jeu lui-même sera conçu avec sa maquette.
export function GamePlaceholder() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const game = GAMES_BY_SLUG[slug];

  return (
    <ConnectedLayout>
      <button type="button" className="back-button" onClick={() => navigate('/jeux')} aria-label="Retour aux jeux">
        ‹
      </button>
      <h1 className="title-font page-title">{game ? game.name : 'Jeu introuvable'}</h1>
      <p className="note">Le jeu est en cours de construction. Maquette et règles à venir.</p>
    </ConnectedLayout>
  );
}
