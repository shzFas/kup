import { useEffect } from 'react';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ApiError } from '@kup/shared';
import { AuthProvider, useAuth } from '@/lib/auth';
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

function RootStack() {
  const { ready } = useAuth();
  const c = useColors();
  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);
  if (!ready) return null;
  return (
    <Stack
      screenOptions={{
        headerBackTitle: 'Назад',
        headerTintColor: c.accent,
        headerTitleStyle: { color: c.text },
        headerStyle: { backgroundColor: c.card },
        contentStyle: { backgroundColor: c.background },
        headerShadowVisible: false,
      }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false, title: 'Главная' }} />
      <Stack.Screen name="search/[category]" options={{ title: 'Поиск' }} />
      <Stack.Screen name="filters/[category]" options={{ presentation: 'modal', title: 'Фильтры' }} />
      <Stack.Screen name="picker" options={{ presentation: 'modal', title: 'Выбор' }} />
      <Stack.Screen name="login" options={{ presentation: 'modal', title: 'Вход' }} />
      <Stack.Screen name="listing/[id]" options={{ title: '' }} />
      <Stack.Screen name="post/[category]" options={{ title: 'Новое объявление' }} />
      <Stack.Screen name="edit/[id]" options={{ title: 'Редактирование' }} />
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
            <StatusBar style={dark ? 'light' : 'dark'} />
            <RootStack />
          </AuthProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
