# My Personal Life

App Android perso (Expo) : agenda, tâches à échéance, objectifs, dépenses, suivi, envies d'achat et anniversaires.
Le design de référence est le canevas « App Agenda Android » (page Haute fidélité) ; le brief est dans le projet LifeEnhancer.

## Lancer l'app

```bash
npm install
npx expo start
```

Ouvrir avec le *development build* sur le téléphone Android : les modules Kotlin locaux et le correctif
Worklets nécessitent un binaire propre à l'app. Pour le construire :
`npx expo run:android` (SDK Android installé) ou `npx eas-cli@latest build --profile development --platform android`.

## Organisation

```
src/
  app/                 routes (Expo Router)
    (tabs)/            Agenda, Objectifs, Dépenses, Suivi, Envies + barre pilule
    ajouter.tsx        feuille du bouton + (saisie rapide fonctionnelle)
    rdv/               nouveau rendez-vous, modification
    en-retard.tsx      Fait / Reporter / Abandonner, datés dans l'historique
    reglages.tsx
  components/
    agenda/            vues Liste, Jour, Semaine, Mois, balayage (swipe-pager), en-têtes
    form/              champs de formulaire (texte, sélecteurs, interrupteurs, puces)
    event-form.tsx     formulaire de rendez-vous
  db/                  SQLite : migrations, données d'exemple, requêtes, hooks
  lib/dates.ts         jours 'YYYY-MM-DD' et instants 'YYYY-MM-DDTHH:mm' en heure locale
  theme/tokens.ts      couleurs, catégories, polices (Outfit + DM Sans)
```

## Données

Tout est stocké en local (expo-sqlite). Le schéma évolue par migrations numérotées dans `src/db/migrations.ts` :
ne jamais modifier une migration existante, en ajouter une nouvelle.

Google Agenda : import en lecture seule des agendas synchronisés sur le téléphone (`expo-calendar`), choisis dans
Réglages avec une catégorie par agenda. Relu à chaque ouverture de l'app (2 mois passés, 1 an à venir) ; titre,
horaires et lieu viennent de Google, catégorie, notes, rappel, échéance et annulation restent dans l'app.

Au premier lancement, des données d'exemple sont créées autour d'aujourd'hui ; elles s'effacent depuis Réglages.

## Branches et versions

- `develop` : branche de travail, tout se fait ici.
- `main` : versions publiées. On n'y touche que par une PR `develop` → `main`.
- À chaque PR fusionnée sur `main`, GitHub Actions crée un tag `vX.Y.Z` et une release (patch par défaut ;
  label `version:minor` ou `version:major` sur la PR pour monter plus haut). Premier tag : `v0.1.0`.

## Vérifier

```bash
npm run typecheck
npx expo lint
```

## Correctif CPU Android

Worklets est épinglé à **0.10.4**, compatible avec Reanimated 4.5.1. Expo SDK 57 recommande encore
0.10.1, qui laisse tourner la boucle UI en arrière-plan faute d'inscription aux événements pause/reprise.
La version 0.10.4 contient le [correctif officiel](https://github.com/software-mansion/react-native-reanimated/pull/10196).

L'entrée `expo.install.exclude` de `package.json` empêche `expo install --fix` de réinstaller 0.10.1.
Conserver cette exception tant que la version recommandée par Expo ne contient pas le correctif.
Toute mise à jour de Worklets doit respecter la matrice de compatibilité de Reanimated.

Ce correctif comporte du code natif : reconstruire l'APK avec `npm run android:build -- prod`
pour l'appliquer au téléphone. Une mise à jour JavaScript seule ne suffit pas.

Pour vérifier : laisser l'agenda au repos, passer au lanceur Android, puis comparer l'activité CPU
avec `adb shell top` ou une trace Perfetto. La boucle permanente doit s'arrêter en arrière-plan
et les animations doivent repartir au retour dans l'app. Les callbacks au repos de React Native 0.86.3
au premier plan sont un problème distinct ; cette mise à jour ne les supprime pas.
