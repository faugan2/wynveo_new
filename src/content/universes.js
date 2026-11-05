import {
  IoBasketballOutline,
  IoFootballOutline,
  IoGiftOutline,
  IoKeypadOutline,
  IoListOutline,
  IoRocketOutline,
  IoSyncCircleOutline,
  IoTennisballOutline,
  IoTrophyOutline,
} from 'react-icons/io5';

// Contenu des pages d'univers (Jeux, Sport), affiché avant connexion.
// Les montants et règles doivent rester alignés sur packages/core/src/games/config.js.
// `icon` est un composant d'icône monochrome, sobre et de même famille que le reste de l'application.
export const UNIVERSES = {
  jeux: {
    title: 'Jeux',
    tagline: 'Des jeux rapides et simples à comprendre, pour tenter votre chance.',
    games: [
      {
        name: 'Lucky Spin',
        icon: IoSyncCircleOutline,
        text: 'Faites tourner la roue. Mise de 100 à 10 000 FCFA, résultat immédiat.',
      },
      {
        name: 'Mystery Box',
        icon: IoGiftOutline,
        text: 'Choisissez un coffre parmi neuf. Le contenu est révélé à l\'ouverture.',
      },
      {
        name: 'Lucky Number',
        icon: IoKeypadOutline,
        text: 'Choisissez cinq numéros sur cinquante. Un tirage a lieu toutes les 15 minutes.',
      },
      {
        name: 'Jackpot quotidien',
        icon: IoTrophyOutline,
        text: 'Achetez des tickets à 1 000 FCFA. Un gagnant est tiré chaque jour à 20 h.',
      },
      {
        name: 'Crash game',
        icon: IoRocketOutline,
        text: 'Le multiplicateur monte. Retirez avant le crash !',
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
    tagline: 'Football, basket et tennis, avec des cotes mises à jour régulièrement.',
    games: [
      {
        name: 'Football',
        icon: IoFootballOutline,
        text: 'Pariez sur le résultat (1 N 2) ou sur le nombre de buts (plus ou moins).',
      },
      {
        name: 'Basket',
        icon: IoBasketballOutline,
        text: 'Pariez sur le vainqueur du match ou sur le total de points (plus ou moins).',
      },
      {
        name: 'Tennis',
        icon: IoTennisballOutline,
        text: 'Pariez sur le vainqueur du match, avant le coup d\'envoi.',
      },
      {
        name: 'Coupon combiné',
        icon: IoListOutline,
        text: 'Regroupez de 2 à 10 choix sur des matchs différents. Les cotes se multiplient.',
      },
    ],
    steps: [
      'Déposez avec Mobile Money ou en crypto.',
      'Choisissez vos matchs et vos cotes avant le coup d\'envoi.',
      'Les paris se règlent automatiquement dès que le résultat est connu.',
    ],
    footerNote: 'Les paris sportifs comportent des risques. Ne pariez que l\'argent que vous pouvez vous permettre de perdre.',
  },
};
