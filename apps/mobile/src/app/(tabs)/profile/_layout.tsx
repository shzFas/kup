import { Stack } from 'expo-router';
import { useI18n } from '@/lib/i18n';
import { useColors } from '@/lib/theme';

/** Profile tab stack: profile · my listings · saved searches · notifications. */
export default function ProfileStack() {
  const c = useColors();
  const { t } = useI18n();
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
      <Stack.Screen name="index" options={{ title: t('nav.profile') }} />
      <Stack.Screen name="my" options={{ title: t('nav.my') }} />
      <Stack.Screen name="saved" options={{ title: t('nav.saved') }} />
      <Stack.Screen name="notifications" options={{ title: t('nav.notifications') }} />
    </Stack>
  );
}
