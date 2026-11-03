// Contenu des pages d'univers (Jeux, Sport), affiché avant connexion.
// Les montants et règles doivent rester alignés sur packages/core/src/games/config.js.
export const UNIVERSES = {
  jeux: {
    title: 'Jeux',
    tagline: 'Des jeux rapides et simples à comprendre, pour tenter votre chance.',
    games: [
      {
        name: 'Lucky Spin',
        icon: '🎡',
        text: 'Faites tourner la roue. Mise de 100 à 10 000 FCFA, résultat immédiat.',
      },
      {
        name: 'Mystery Box',
        icon: '🎁',
        text: 'Choisissez un coffre parmi neuf. Le contenu est révélé à l\'ouverture.',
      },
      {
        name: 'Lucky Number',
        icon: '🔢',
        text: 'Choisissez cinq numéros sur cinquante. Un tirage a lieu toutes les 15 minutes.',
      },
      {
        name: 'Jackpot quotidien',
        icon: '💰',
        text: 'Achetez des tickets à 1 000 FCFA. Un gagnant est tiré chaque jour à 20 h.',
      },
      {
        name: 'Crash game',
        icon: '🚀',
        text: 'Bientôt disponible.',
        soon: true,
      },
    ],
    steps: [
      'Déposez avec Mobile Money ou en crypto.',
      'Choisissez votre jeu et votre mise.',
      'Retirez vos gains vers votre Mobile Money ou en crypto.',
    ],
    footerNote: 'Les jeux comportent des risques. Ne jouez que l\'argent que vous pouvez vous permettre de perdre.',
  },
  sport: {
    title: 'Sport',
    tagline: 'Football, basket et tennis, avec des cotes en direct.',
    games: [],
    steps: [],
    footerNote: 'Présentation complète à venir.',
  },
};
