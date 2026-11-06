import { db } from './firebase.js';

// Valeurs de repli du jackpot, identiques à functions/games.js (JACKPOT). Utilisées si le réglage n'existe pas encore.
const DEFAULTS = { ticketPrice: 1000, potShare: 0.8 };

// État du tour de jackpot en cours, lu directement dans Firestore (sans fonction).
// Le tour est ouvert par la fonction de tirage quotidien. Renvoie null s'il n'y a pas de tour ouvert.
// uid : si renseigné, renvoie aussi le nombre de tickets de ce joueur sur le tour.
export async function loadJackpotState(uid = null) {
  const roundSnapshot = await db.collection('wy_jackpot_rounds').where('status', '==', 'open').limit(1).get();
  if (roundSnapshot.empty) return null;
  const roundDoc = roundSnapshot.docs[0];
  const round = roundDoc.data();

  const settingsSnapshot = await db.collection('wy_settings').doc('jackpot').get();
  const settings = settingsSnapshot.exists ? settingsSnapshot.data() : {};
  const ticketPrice = Number.isInteger(settings.ticketPrice) && settings.ticketPrice > 0 ? settings.ticketPrice : DEFAULTS.ticketPrice;
  const potShare = typeof settings.potShare === 'number' && settings.potShare > 0 && settings.potShare <= 1 ? settings.potShare : DEFAULTS.potShare;

  let myTickets = 0;
  if (uid) {
    const mine = await db
      .collection('wy_jackpot_tickets')
      .where('roundId', '==', roundDoc.id)
      .where('uid', '==', uid)
      .get();
    myTickets = mine.size;
  }

  return {
    roundId: roundDoc.id,
    drawAt: round.drawAt ? round.drawAt.toMillis() : 0,
    pot: round.pot || 0,
    ticketsCount: round.ticketsCount || 0,
    myTickets,
    recentWinners: Array.isArray(settings.recentWinners) ? settings.recentWinners : [],
    ticketPrice,
    potShare,
  };
}
