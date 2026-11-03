// Jeux proposés dans l'application. Les règles détaillées et les montants viennent du serveur (à implémenter).
export const GAMES = [
  {
    slug: 'lucky-spin',
    name: 'Lucky Spin',
    icon: '🎡',
    text: 'Faites tourner la roue. Résultat immédiat.',
    stake: 'Mise de 100 à 10 000 FCFA',
  },
  {
    slug: 'mystery-box',
    name: 'Mystery Box',
    icon: '🎁',
    text: 'Choisissez un coffre parmi neuf. Le contenu est révélé à l\'ouverture.',
    stake: 'Mise à définir',
  },
  {
    slug: 'lucky-number',
    name: 'Lucky Number',
    icon: '🔢',
    text: 'Choisissez cinq numéros sur cinquante. Tirage toutes les 15 minutes.',
    stake: 'Mise de 100 à 1 000 FCFA',
  },
  {
    slug: 'jackpot',
    name: 'Jackpot quotidien',
    icon: '💰',
    text: 'Achetez des tickets. Un gagnant est tiré chaque jour à 20 h.',
    stake: 'Ticket à 1 000 FCFA',
  },
  {
    slug: 'crash',
    name: 'Crash game',
    icon: '🚀',
    text: 'Le multiplicateur monte. Retirez avant le crash !',
    stake: 'Mise de 100 à 10 000 FCFA',
  },
];

export const GAMES_BY_SLUG = Object.fromEntries(GAMES.map((game) => [game.slug, game]));
