import { useParams, useNavigate } from 'react-router-dom';
import ConnectedLayout from '../components/ConnectedLayout.jsx';
import GameCard from '../components/GameCard.jsx';
import { GAMES, GAMES_BY_SLUG } from '../content/games.js';
import { formatFcfa } from '../lib/format.js';
import { useJackpotSummary } from '../lib/jackpotSummary.js';
import { usePlayCounts } from '../lib/gameStats.js';
import { useGameFavorites } from '../lib/gameFavorites.js';
import { GAME_PAGES, useHomeContent } from '../lib/homeContent.js';

// Page Jeux : favoris du membre en haut, puis tous les jeux, en cartes (même style que la rangée de l'accueil).
export default function Games() {
  const jackpot = useJackpotSummary();
  const playCounts = usePlayCounts();
  const { favorites, toggle } = useGameFavorites();
  const { games: homeGames } = useHomeContent();
  const favoriteGames = GAMES.filter((game) => favorites.includes(game.slug));

  // Visuels, badges et couleurs réglés dans l'admin (accueil), rattachés à la page du jeu.
  const homeBySlug = Object.fromEntries(
    homeGames
      .filter((game) => GAME_PAGES[game.key])
      .map((game) => [GAME_PAGES[game.key].replace('/jeux/', ''), game])
  );

  // Une carte de jeu, avec le menu ⋮ (favoris, partage, infos).
  function renderCard(game) {
    const home = homeBySlug[game.slug];
    return (
      <GameCard
        name={game.name}
        infoTo="/univers/jeux"
        meta={game.slug === 'jackpot' ? `Cagnotte : ${jackpot ? formatFcfa(jackpot.pot) : '—'}` : game.stake}
        to={`/jeux/${game.slug}`}
        plays={playCounts ? playCounts[game.slug] : undefined}
        imageUrl={home?.imageUrl || ''}
        color={home?.color}
        badge={home?.badge}
        icon={game.icon}
        soon={Boolean(game.soon)}
        favorite={favorites.includes(game.slug)}
        onToggleFavorite={(saved) => toggle(game.slug, saved)}
      />
    );
  }

  return (
    <ConnectedLayout>
      <h1 className="title-font page-title">Jeux</h1>
      <p className="note">Choisissez un jeu et misez avec le solde de vos dépôts.</p>

      {favoriteGames.length > 0 && (
        <section className="game-favorites" aria-labelledby="game-favorites-title">
          <h2 id="game-favorites-title" className="section-label-sport">Vos favoris</h2>
          <ul className="game-tile-grid">
            {favoriteGames.map((game) => (
              <li key={game.slug}>{renderCard(game)}</li>
            ))}
          </ul>
        </section>
      )}

      <ul className="game-tile-grid">
        {GAMES.map((game) => (
          <li key={game.slug}>{renderCard(game)}</li>
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
