import { useEffect, useState } from 'react';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ApiError } from '@kup/shared';
import { AuthProvider, useAuth } from '@/lib/auth';
import { EventsProvider } from '@/lib/events';
import { loadLang, useI18n } from '@/lib/i18n';
import { useLangSync } from '@/lib/langSync';
import { useColors, useIsDark } from '@/lib/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (count, e) => !(e instanceof ApiError && e.status >= 400 && e.status < 500) && count < 2,
    },
  },
});

// Language is read from storage before the first screen renders (no flash of the wrong language).
const langLoaded = loadLang();

function RootStack() {
  const { ready: authReady } = useAuth();
  const { t } = useI18n();
  const c = useColors();
  const [langReady, setLangReady] = useState(false);
  useEffect(() => {
    void langLoaded.finally(() => setLangReady(true));
  }, []);
  useLangSync();
  const ready = authReady && langReady;
  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);
  if (!ready) return null;
  return (
    <Stack
      screenOptions={{
        headerBackTitle: t('common.back'),
        headerTintColor: c.accent,
        headerTitleStyle: { color: c.text },
        headerStyle: { backgroundColor: c.card },
        contentStyle: { backgroundColor: c.background },
        headerShadowVisible: false,
      }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false, title: t('nav.home') }} />
      <Stack.Screen name="search/[category]" options={{ title: t('nav.search') }} />
      <Stack.Screen name="filters/[category]" options={{ presentation: 'modal', title: t('nav.filters') }} />
      <Stack.Screen name="picker" options={{ presentation: 'modal', title: t('nav.picker') }} />
      <Stack.Screen name="login" options={{ presentation: 'modal', title: t('nav.login') }} />
      <Stack.Screen name="listing/[id]" options={{ title: '' }} />
      <Stack.Screen name="chat/[id]" options={{ headerShown: false, title: t('nav.chat') }} />
      <Stack.Screen name="post/[category]" options={{ title: t('nav.newListing') }} />
      <Stack.Screen name="edit/[id]" options={{ title: t('nav.edit') }} />
      <Stack.Screen name="[category]" options={{ headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  const dark = useIsDark();
  const c = useColors();
  const base = dark ? DarkTheme : DefaultTheme;
  const theme = {
    ...base,
    colors: { ...base.colors, primary: c.accent, background: c.background, card: c.card, text: c.text, border: c.border },
  };
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider value={theme}>
          <AuthProvider>
            <EventsProvider>
              <StatusBar style={dark ? 'light' : 'dark'} />
              <RootStack />
            </EventsProvider>
          </AuthProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
