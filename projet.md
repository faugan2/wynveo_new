# Wynveo

Plateforme de jeux et de paris sportifs avec **un seul compte et un seul solde** pour les deux univers.

- **Nom** : Wynveo
- **Dépôt** : https://github.com/faugan2/wynveo_new.git
- **Stack** : React (JavaScript) + Vite, Firebase en syntaxe v8 (modules `compat`), Cloud Functions pour tout ce qui touche à l'argent
- **Marché** : Togo (numéros togolais, T-Money / Flooz, FCFA)

## Principes

1. **Tout l'argent passe par les Cloud Functions** : tirages, mises, gains, retraits et règlements sont calculés côté serveur, dans des transactions Firestore. Le client n'écrit jamais de solde.
2. **Tirages aléatoires sécurisés** : `crypto.randomInt` côté serveur.
3. **Un portefeuille partagé** entre Jeux et Sport (solde réel, bonus, solde retirable), mis à jour en direct.
4. **Les paramètres vivent dans le code** : `packages/core/src/games/config.js` (jeux) et `packages/core/src/sport/config.js` (compétitions).

## Fonctionnalités

### Compte et vérification

- Inscription et connexion par **numéro togolais + mot de passe**, **sans SMS** (gratuit). Un numéro = un compte.
- **Vérification du numéro** : via le **premier dépôt Mobile Money fait depuis ce numéro**, confirmé avec le code secret de l'opérateur. Cette vérification débloque les retraits et le bonus.

### Portefeuille

- **Dépôt** : T-Money / Flooz. Actuellement **paiement simulé**. Bonus de bienvenue de 100 % jusqu'à 10 000 FCFA sur le 1er dépôt depuis le numéro du compte.
- **Retrait** : numéro vérifié obligatoire, envoi uniquement vers le numéro du compte, plafond de 50 000 FCFA/jour sans vérification d'identité, validation automatique ou manuelle.
- **Historique** : filtres Tout / Dépôts / Retraits / Jeux / Sport.
- **Règle du bonus** : une fois les conditions de mise remplies, le bonus devient retirable. Les mises sont payées d'abord par l'argent réel, puis par le bonus. Les gains reviennent au prorata.

### Jeux (étape 2, livrée)

| Jeu | Fonctionnement | Retour au joueur |
|---|---|---|
| Lucky Spin | Roue à 8 cases, mise 100 – 10 000, résultat instantané | 89,9 % |
| Mystery Box | 9 coffres tirés avant ouverture, gain = coffre choisi | 89 % |
| Lucky Number | 5 numéros sur 50, mise 100 – 1 000, tirage toutes les 15 min (Cloud Scheduler) | ≈ 70 % |
| Jackpot quotidien | Tickets à 1 000 FCFA, 80 % vont à la cagnotte, 1 gagnant chaque jour à 20:00 | 80 % |
| Crash game | **Non décrit pour l'instant** (maquette à fournir) | à définir |

- Collections : `bets`, `lnDraws`, `jackpotRounds` (lecture seule pour les joueurs).
- **Mode démo** : Lucky Number tire toutes les 2 minutes, et des boutons « Démo : tirer maintenant » sont affichés.

### Sport (étape 3, livrée)

- **Marchés** : football (1 N 2), basket et tennis (1 2), et marché « total » (plus / moins de). Les paris sont possibles **avant le coup d'envoi** uniquement.
- **Coupon** : simple (un ticket par choix) ou combiné (cotes multipliées, un choix par match, 2 à 10 choix). Mise de 100 à 200 000 FCFA, gain maximum de 5 000 000 FCFA.
- **Cotes qui bougent** : le serveur compare les cotes vues par le joueur aux cotes actuelles. En cas d'écart, le joueur doit accepter les nouvelles cotes.
- **Règlement** : automatique dès que le résultat est connu. Match annulé = choix compté à 1 (pari simple remboursé).
- **Import des cotes** : The Odds API, toutes les 3 h (moyenne des bookmakers + marge Wynveo de 6 %). Les scores sont relevés toutes les 20 min, seulement s'il y a un match en cours.
- Les cotes modifiées à la main ne sont plus écrasées par l'import.
- Collection : `sportEvents` (lecture seule pour les joueurs).
- **Mode démo** : matchs générés autour de l'heure actuelle, avec des boutons « Démo : terminer le match » et « Faire baisser la cote ».

### Administration

- Connexion par e-mail et rôle. Rôles : **Super admin** et **Trader**.
- Tableau de bord.
- Retraits à valider : approuver, ou refuser avec motif.
- Matchs et cotes : créer et modifier un match (calcul de la marge), suspendre, saisir le score ou annuler, lancer l'import.
- Journal d'audit.

## Exigences à venir

- **Paiement en crypto** pour les dépôts. Les montants sont convertis automatiquement en dollars ou en monnaie locale selon la configuration.
- Administration des utilisateurs et des transactions.
- KYC, jeu responsable, notifications.
- Vrai paiement Mobile Money (T-Money / Flooz) et mise en ligne.

## Feuille de route

| Étape | Contenu | Statut |
|---|---|---|
| 1 | Compte, vérification, portefeuille, dépôt, retrait, historique, accueil, admin de base | Livré |
| 2 | Les 4 jeux | Livré |
| 3 | Sport : matchs, coupons, cotes, règlement, import | Livré |
| 4 | Admin utilisateurs et transactions | À faire |
| 5 | KYC, jeu responsable, notifications | À faire |
| 6 | Vrai paiement (Mobile Money et crypto), mise en ligne | À faire |

## Questions ouvertes

- Règles et maquette du **crash game** (5e jeu, à fournir par image).
- Détail du fonctionnement du paiement crypto (réseaux, fournisseur, conversion).
- Fournisseur réel de paiement Mobile Money à intégrer en étape 6.
