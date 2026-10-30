import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { View, type ColorValue } from 'react-native';
import { useColors } from '@/lib/theme';
import type { IconName } from '@/components/ui';

function icon(name: IconName, active: IconName) {
  return function TabIcon({ color, focused, size }: { color: ColorValue; focused: boolean; size: number }) {
    return <Ionicons name={focused ? active : name} size={size} color={typeof color === "string" ? color : undefined} />;
  };
}

export default function TabsLayout() {
  const c = useColors();
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
      }}>
      <Tabs.Screen name="index" options={{ title: 'Поиск', headerShown: false, tabBarIcon: icon('search-outline', 'search') }} />
      <Tabs.Screen name="favorites" options={{ title: 'Избранное', tabBarIcon: icon('heart-outline', 'heart') }} />
      <Tabs.Screen
        name="post"
        options={{
          title: 'Подать',
          headerTitle: 'Подать объявление',
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
      <Tabs.Screen name="my" options={{ title: 'Мои', headerTitle: 'Мои объявления', tabBarIcon: icon('list-outline', 'list') }} />
      <Tabs.Screen name="profile" options={{ title: 'Профиль', tabBarIcon: icon('person-circle-outline', 'person-circle') }} />
    </Tabs>
  );
}
