// Montants du portefeuille à partir du profil Firestore (wy_users/{uid}.balance).
// Deux soldes distincts : l'argent déposé (deposit) et le bonus de parrainage (bonus).
// Le retirable ne concerne que l'argent déposé.
export function walletFromProfile(profile) {
  const balance = profile?.balance ?? {};

  return {
    deposit: balance.real ?? 0,
    bonus: balance.bonus ?? 0,
    withdrawable: balance.withdrawable ?? 0,
  };
}
