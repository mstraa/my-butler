import type { ConfigContext, ExpoConfig } from 'expo/config';

/*
 * Deux apps côte à côte sur le téléphone :
 * - la vraie (profil « preview ») : com.mypersonallife.app, autonome, pour tous les jours ;
 * - la variante de développement (APP_VARIANT=development) : com.mypersonallife.app.dev,
 *   « My Personal Life (dev) », qui se charge depuis le serveur Expo du Mac. Données séparées.
 * Le profil « production » (APP_VARIANT=production) construit la même vraie app, en APK allégé :
 * arm64 uniquement, R8 + suppression des ressources inutilisées, bibliothèques natives compressées.
 */
const IS_DEV = process.env.APP_VARIANT === 'development';
const IS_PROD = process.env.APP_VARIANT === 'production';

const PROD_ANDROID_BUILD_PROPERTIES = {
  buildArchs: ['arm64-v8a'],
  enableMinifyInReleaseBuilds: true,
  enableShrinkResourcesInReleaseBuilds: true,
  useLegacyPackaging: true,
  // expo-sqlite ne fournit pas de règles R8 : ses bindings sont appelés par nom depuis le C++ (JNI).
  extraProguardRules: '-keep class expo.modules.sqlite.** { *; }',
};

type PluginEntry = NonNullable<ExpoConfig['plugins']>[number];

function withProdBuildProperties(plugins: ExpoConfig['plugins']): ExpoConfig['plugins'] {
  if (!IS_PROD) return plugins;
  return plugins?.map((plugin): PluginEntry => {
    if (!Array.isArray(plugin) || plugin[0] !== 'expo-build-properties') return plugin;
    const options = plugin[1] ?? {};
    return [
      plugin[0],
      { ...options, android: { ...options.android, ...PROD_ANDROID_BUILD_PROPERTIES } },
    ];
  });
}

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...(config as ExpoConfig),
  name: IS_DEV ? 'My Personal Life (dev)' : config.name!,
  // Schéma distinct : un lien mypersonallife:// ouvre toujours la vraie app.
  scheme: IS_DEV ? 'mypersonallife-dev' : config.scheme,
  android: {
    ...config.android,
    package: IS_DEV ? 'com.mypersonallife.app.dev' : config.android?.package,
  },
  plugins: withProdBuildProperties(config.plugins),
});
