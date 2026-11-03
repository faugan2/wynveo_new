// Cotes Wynveo à partir des cotes des bookmakers (The Odds API).
// Pour chaque issue : moyenne des probabilités sans marge de chaque bookmaker, puis cote = 1 / (p × 1,06).
// La marge de 6 % est ainsi répartie sur toutes les issues. Les cotes d'échange (h2h_lay) sont exclues.
const MARGIN = 1.06;
const MAIN_TOTAL_LINE = 2.5;

// Probabilités sans marge d'un bookmaker : on retire la marge en normalisant les probabilités implicites.
function fairProbabilities(prices) {
  const implied = prices.map((price) => 1 / price);
  const total = implied.reduce((sum, value) => sum + value, 0);
  return implied.map((value) => value / total);
}

// Probabilité moyenne de chaque issue, sur les bookmakers qui cotent toutes les issues demandées.
function averageProbabilities(event, marketKey, names, point) {
  const rows = [];
  for (const bookmaker of event.bookmakers) {
    const market = bookmaker.markets.find((item) => item.key === marketKey);
    if (!market) continue;
    const prices = names.map((name) => {
      const outcome = market.outcomes.find(
        (item) => item.name === name && (point === undefined || item.point === point)
      );
      return outcome ? outcome.price : null;
    });
    if (prices.some((price) => price === null)) continue;
    rows.push(fairProbabilities(prices));
  }
  if (rows.length === 0) return null;
  return names.map((_, index) => rows.reduce((sum, row) => sum + row[index], 0) / rows.length);
}

// Cote Wynveo arrondie à 2 décimales, vers le bas (le joueur ne reçoit jamais plus que la cote affichée).
const toPrice = (probability) => Math.floor((1 / (probability * MARGIN)) * 100) / 100;

// Cotes d'un match : 1 N 2 (home, draw, away) et plus/moins sur la ligne principale (over, under).
// Renvoie null pour un marché sans aucune cote de bookmaker.
function eventPrices(event) {
  const oneX2 = averageProbabilities(event, 'h2h', [event.home_team, 'Draw', event.away_team]);
  const totals = averageProbabilities(event, 'totals', ['Over', 'Under'], MAIN_TOTAL_LINE);
  return {
    home: oneX2 ? toPrice(oneX2[0]) : null,
    draw: oneX2 ? toPrice(oneX2[1]) : null,
    away: oneX2 ? toPrice(oneX2[2]) : null,
    line: MAIN_TOTAL_LINE,
    over: totals ? toPrice(totals[0]) : null,
    under: totals ? toPrice(totals[1]) : null,
  };
}

module.exports = { MARGIN, MAIN_TOTAL_LINE, fairProbabilities, averageProbabilities, toPrice, eventPrices };
