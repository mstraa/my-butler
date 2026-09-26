import type { ConfigContext, ExpoConfig } from 'expo/config';

/*
 * Deux apps côte à côte sur le téléphone :
 * - la vraie (profil « preview ») : com.mypersonallife.app, autonome, pour tous les jours ;
 * - la variante de développement (APP_VARIANT=development) : com.mypersonallife.app.dev,
 *   « My Personal Life (dev) », qui se charge depuis le serveur Expo du Mac. Données séparées.
 */
const IS_DEV = process.env.APP_VARIANT === 'development';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...(config as ExpoConfig),
  name: IS_DEV ? 'My Personal Life (dev)' : config.name!,
  // Schéma distinct : un lien mypersonallife:// ouvre toujours la vraie app.
  scheme: IS_DEV ? 'mypersonallife-dev' : config.scheme,
  android: {
    ...config.android,
    package: IS_DEV ? 'com.mypersonallife.app.dev' : config.android?.package,
  },
});
