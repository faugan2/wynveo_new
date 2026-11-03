// Compétitions suivies et paramètres de l'import des cotes.
// Valeurs de départ : la Ligue 1 seule. D'autres compétitions s'ajoutent ici, puis dans l'admin.
const SPORT_CONFIG = {
  leagues: [{ key: 'soccer_france_ligue_one', title: 'Ligue 1' }],
  regions: 'eu',
  markets: 'h2h,totals',
};

module.exports = { SPORT_CONFIG };
