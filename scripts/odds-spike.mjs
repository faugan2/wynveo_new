// Test ponctuel de The Odds API sur la Ligue 1 (soccer_france_ligue_one).
// Usage (PowerShell) : $env:ODDS_API_KEY="votre_clé"; node scripts/odds-spike.mjs
// Enregistre les réponses brutes dans functions/test/fixtures/ pour les tests unitaires.
// La clé n'est jamais affichée ni écrite dans un fichier.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const apiKey = process.env.ODDS_API_KEY;
if (!apiKey) {
  console.error('ODDS_API_KEY manquant. Définissez-le dans le terminal avant de lancer le script.');
  process.exit(1);
}

const BASE = 'https://api.the-odds-api.com/v4';
const SPORT = 'soccer_france_ligue_one';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixturesDir = path.join(root, 'functions', 'test', 'fixtures');

// Appel HTTP ; affiche le statut et les crédits restants, sans l'URL (qui contient la clé).
async function call(label, pathAndQuery) {
  const response = await fetch(`${BASE}${pathAndQuery}&apiKey=${apiKey}`);
  const quota = {
    remaining: response.headers.get('x-requests-remaining'),
    used: response.headers.get('x-requests-used'),
    lastCost: response.headers.get('x-requests-last'),
  };
  console.log(`[${label}] HTTP ${response.status} · crédits restants ${quota.remaining} · coût de l'appel ${quota.lastCost}`);
  if (!response.ok) {
    console.error(`[${label}] erreur :`, await response.text());
    process.exit(1);
  }
  return { body: await response.json(), quota };
}

async function save(name, data) {
  await mkdir(fixturesDir, { recursive: true });
  await writeFile(path.join(fixturesDir, name), JSON.stringify(data, null, 2), 'utf8');
  console.log(`  → functions/test/fixtures/${name}`);
}

// 1. Liste des sports (gratuit) : vérifie la clé et la présence de la Ligue 1.
const sports = await call('sports', '/sports/?');
const ligue1 = sports.body.find((sport) => sport.key === SPORT);
console.log(`  Ligue 1 présente : ${ligue1 ? `oui (${ligue1.title}, active : ${ligue1.active})` : 'NON'}`);
await save('sports.json', sports.body.filter((sport) => sport.key.startsWith('soccer_france')));

// 2. Cotes : 1 N 2 et plus/moins, région eu (coût attendu : 2 marchés × 1 région = 2 crédits).
const odds = await call('odds', `/sports/${SPORT}/odds/?regions=eu&markets=h2h,totals&oddsFormat=decimal`);
console.log(`  Matchs avec cotes : ${odds.body.length}`);
if (odds.body[0]) {
  const first = odds.body[0];
  console.log(`  Exemple : ${first.home_team} – ${first.away_team} à ${first.commence_time}`);
  console.log(`  Bookmakers : ${first.bookmakers.length}`);
  for (const market of first.bookmakers[0]?.markets || []) {
    console.log(`  Marché ${market.key} :`, market.outcomes.map((o) => `${o.name}${o.point !== undefined ? ` (${o.point})` : ''} = ${o.price}`).join(' | '));
  }
}
await save('odds-ligue1.json', odds.body);

// 3. Scores sans daysFrom (coût attendu : 1 crédit), pour les matchs en cours ou à venir.
const scores = await call('scores', `/sports/${SPORT}/scores/?dateFormat=iso`);
const finished = scores.body.filter((event) => event.completed);
console.log(`  Matchs dans la réponse : ${scores.body.length} · terminés : ${finished.length}`);
if (finished[0]) console.log('  Exemple terminé :', JSON.stringify(finished[0].scores));
await save('scores-ligue1.json', scores.body);

console.log('Terminé. Ne lancez pas ce script en boucle : chaque lancement consomme des crédits.');
