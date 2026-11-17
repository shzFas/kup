import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { View, type ColorValue } from 'react-native';
import { useI18n } from '@/lib/i18n';
import { useSavedSearchesNew, useUnreadChats, useUnreadNotifications } from '@/lib/queries';
import { useColors } from '@/lib/theme';
import type { IconName } from '@/components/ui';

function icon(name: IconName, active: IconName) {
  return function TabIcon({ color, focused, size }: { color: ColorValue; focused: boolean; size: number }) {
    return <Ionicons name={focused ? active : name} size={size} color={typeof color === 'string' ? color : undefined} />;
  };
}

const badge = (n: number) => (n > 0 ? (n > 99 ? '99+' : n) : undefined);

export default function TabsLayout() {
  const c = useColors();
  const { t } = useI18n();
  const unreadChats = useUnreadChats();
  const unreadNotifications = useUnreadNotifications();
  const savedNew = useSavedSearchesNew();
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: c.accent,
        tabBarInactiveTintColor: c.textTertiary,
        tabBarStyle: { backgroundColor: c.card, borderTopColor: c.border },
        headerStyle: { backgroundColor: c.card },
        headerTitleStyle: { color: c.text },
        headerShadowVisible: false,
        sceneStyle: { backgroundColor: c.background },
        tabBarBadgeStyle: { backgroundColor: c.danger, color: '#fff', fontSize: 11 },
      }}>
      <Tabs.Screen name="index" options={{ title: t('nav.search'), headerShown: false, tabBarIcon: icon('search-outline', 'search') }} />
      <Tabs.Screen
        name="favorites"
        options={{ title: t('nav.favorites'), tabBarIcon: icon('heart-outline', 'heart'), tabBarBadge: badge(savedNew) }}
      />
      <Tabs.Screen
        name="post"
        options={{
          title: t('nav.post'),
          headerTitle: t('nav.postTitle'),
          tabBarIcon: ({ focused }) => (
            <View
              style={{
                width: 34,
                height: 34,
                borderRadius: 17,
                backgroundColor: focused ? c.accent : c.accentSoft,
                alignItems: 'center',
                justifyContent: 'center',
              }}>
              <Ionicons name="add" size={24} color={focused ? c.accentText : c.accent} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{ title: t('nav.messages'), tabBarIcon: icon('chatbubbles-outline', 'chatbubbles'), tabBarBadge: badge(unreadChats) }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('nav.profile'),
          headerShown: false,
          tabBarIcon: icon('person-circle-outline', 'person-circle'),
          tabBarBadge: badge(unreadNotifications),
        }}
      />
    </Tabs>
  );
}
