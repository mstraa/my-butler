# My Butler

App Android perso (Expo) : agenda, tâches à échéance, objectifs, dépenses, suivi, envies d'achat et anniversaires.
Le design de référence est le canevas « App Agenda Android » (page Haute fidélité) ; le brief est dans le projet LifeEnhancer.

## Lancer l'app

```bash
npm install
npx expo start
```

Puis ouvrir dans **Expo Go** sur le téléphone Android (scanner le QR code). Ça suffit pour l'étape actuelle.

Plus tard (notification fixe, bouton Partager d'Android, module Kotlin), il faudra un *development build* :
`npx expo run:android` (SDK Android installé) ou `npx eas-cli@latest build --profile development --platform android`.

## Organisation

```
src/
  app/                 routes (Expo Router)
    (tabs)/            Agenda, Objectifs, Dépenses, Suivi, Envies + barre pilule
    ajouter.tsx        feuille du bouton + (saisie rapide fonctionnelle)
    en-retard.tsx      Fait / Reporter / Abandonner, datés dans l'historique
    reglages.tsx
  components/          éléments d'interface (carte de jour, barre, texte, icônes)
  db/                  SQLite : migrations, données d'exemple, requêtes, hooks
  lib/dates.ts         jours 'YYYY-MM-DD' et instants 'YYYY-MM-DDTHH:mm' en heure locale
  theme/tokens.ts      couleurs, catégories, polices (Outfit + DM Sans)
```

## Données

Tout est stocké en local (expo-sqlite). Le schéma évolue par migrations numérotées dans `src/db/migrations.ts` :
ne jamais modifier une migration existante, en ajouter une nouvelle.

Au premier lancement, des données d'exemple sont créées autour d'aujourd'hui ; elles s'effacent depuis Réglages.

## Vérifier

```bash
npm run typecheck
npx expo lint
```
