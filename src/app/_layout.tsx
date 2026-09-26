import { DMSans_400Regular, DMSans_500Medium, DMSans_600SemiBold, DMSans_700Bold } from '@expo-google-fonts/dm-sans';
import { Outfit_200ExtraLight, Outfit_300Light, Outfit_500Medium } from '@expo-google-fonts/outfit';
import { useFonts } from 'expo-font';
import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AnimatedSplash } from '@/components/animated-splash';
import { DialogHost } from '@/components/dialog';
import { GoogleSync } from '@/components/google-sync';
import { HealthSync } from '@/components/health-sync';
import { NotificationSync } from '@/components/notification-sync';
import { migrateDbIfNeeded } from '@/db/migrations';
import { markSplashDone } from '@/lib/splash-state';
import { colors } from '@/theme/tokens';

SplashScreen.preventAutoHideAsync();

const navTheme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: colors.bg, card: colors.bg, text: colors.text, border: colors.border },
};

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Outfit_200ExtraLight,
    Outfit_300Light,
    Outfit_500Medium,
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_600SemiBold,
    DMSans_700Bold,
  });

  // Le splash natif (noir, vide) laisse la place au splash animé dès que les polices sont prêtes.
  const [splashDone, setSplashDone] = useState(false);
  const endSplash = useCallback(() => {
    setSplashDone(true);
    markSplashDone();
  }, []);
  useEffect(() => {
    if (fontsLoaded || fontError) SplashScreen.hideAsync();
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <ThemeProvider value={navTheme}>
        {/* Nom de fichier gardé de « My Butler » : le changer repartirait d'une base vide. */}
        <SQLiteProvider databaseName="butler.db" onInit={migrateDbIfNeeded}>
          <StatusBar style="light" />
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen
              name="ajouter"
              options={{ presentation: 'transparentModal', animation: 'none', contentStyle: { backgroundColor: 'transparent' } }}
            />
            <Stack.Screen name="en-retard" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="reglages" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="a-venir" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="rdv/nouveau" options={{ animation: 'slide_from_bottom' }} />
            <Stack.Screen name="rdv/modifier/[id]" options={{ animation: 'slide_from_bottom' }} />
            <Stack.Screen
              name="rdv/apercu/[id]"
              options={{ presentation: 'transparentModal', animation: 'none', contentStyle: { backgroundColor: 'transparent' } }}
            />
            <Stack.Screen
              name="depense/nouvelle"
              options={{ animation: 'slide_from_bottom', contentStyle: { backgroundColor: colors.sheet } }}
            />
            <Stack.Screen
              name="depense/mois"
              options={{ presentation: 'transparentModal', animation: 'none', contentStyle: { backgroundColor: 'transparent' } }}
            />
            <Stack.Screen
              name="depense/filtre"
              options={{ presentation: 'transparentModal', animation: 'none', contentStyle: { backgroundColor: 'transparent' } }}
            />
            <Stack.Screen
              name="depense/budget"
              options={{ presentation: 'transparentModal', animation: 'none', contentStyle: { backgroundColor: 'transparent' } }}
            />
            <Stack.Screen
              name="suivi/jour"
              options={{ presentation: 'transparentModal', animation: 'none', contentStyle: { backgroundColor: 'transparent' } }}
            />
            <Stack.Screen
              name="suivi/heure"
              options={{ presentation: 'transparentModal', animation: 'none', contentStyle: { backgroundColor: 'transparent' } }}
            />
            <Stack.Screen name="suivi/nouveau" options={{ animation: 'slide_from_bottom' }} />
            <Stack.Screen name="suivi/modifier/[id]" options={{ animation: 'slide_from_bottom' }} />
            <Stack.Screen name="envie/nouvelle" options={{ animation: 'slide_from_bottom' }} />
            <Stack.Screen name="envie/partage" options={{ animation: 'fade' }} />
            <Stack.Screen name="envie/modifier/[id]" options={{ animation: 'slide_from_bottom' }} />
            <Stack.Screen
              name="envie/[id]"
              options={{ presentation: 'transparentModal', animation: 'none', contentStyle: { backgroundColor: 'transparent' } }}
            />
            <Stack.Screen name="objectif/nouveau" options={{ animation: 'slide_from_bottom' }} />
            <Stack.Screen name="objectif/modifier/[id]" options={{ animation: 'slide_from_bottom' }} />
            <Stack.Screen
              name="objectif/historique/[id]"
              options={{ presentation: 'transparentModal', animation: 'none', contentStyle: { backgroundColor: 'transparent' } }}
            />
            <Stack.Screen name="anniversaires/index" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="anniversaires/[id]" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="anniversaires/nouveau" options={{ animation: 'slide_from_bottom' }} />
            <Stack.Screen name="anniversaires/modifier/[id]" options={{ animation: 'slide_from_bottom' }} />
            <Stack.Screen name="tache/nouvelle" options={{ animation: 'slide_from_bottom' }} />
            <Stack.Screen name="tache/modifier/[id]" options={{ animation: 'slide_from_bottom' }} />
            <Stack.Screen
              name="tache/apercu/[id]"
              options={{ presentation: 'transparentModal', animation: 'none', contentStyle: { backgroundColor: 'transparent' } }}
            />
            <Stack.Screen
              name="tache/terminer/[id]"
              options={{ presentation: 'transparentModal', animation: 'none', contentStyle: { backgroundColor: 'transparent' } }}
            />
            <Stack.Screen
              name="rdv/annuler/[id]"
              options={{ presentation: 'transparentModal', animation: 'none', contentStyle: { backgroundColor: 'transparent' } }}
            />
          </Stack>
          <NotificationSync />
          <HealthSync />
          <GoogleSync />
          <DialogHost />
        </SQLiteProvider>
        {/* Hors de <SQLiteProvider> : ses enfants directs ne sont pas re-rendus quand cet état change,
            et le splash (noir, transparent à la fin de l'animation) restait posé sur l'app. */}
        {!splashDone && <AnimatedSplash onDone={endSplash} />}
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
