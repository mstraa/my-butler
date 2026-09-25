import { DMSans_400Regular, DMSans_500Medium, DMSans_600SemiBold, DMSans_700Bold } from '@expo-google-fonts/dm-sans';
import { Outfit_200ExtraLight, Outfit_300Light, Outfit_500Medium } from '@expo-google-fonts/outfit';
import { useFonts } from 'expo-font';
import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { migrateDbIfNeeded } from '@/db/migrations';
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

  useEffect(() => {
    if (fontsLoaded || fontError) SplashScreen.hideAsync();
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <ThemeProvider value={navTheme}>
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
            <Stack.Screen name="rdv/[id]" options={{ animation: 'slide_from_bottom' }} />
          </Stack>
        </SQLiteProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
