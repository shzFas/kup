import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useCategories } from '@/lib/queries';
import { useI18n } from '@/lib/i18n';
import { radius, useColors } from '@/lib/theme';
import { CategoryIcon } from '@/components/CategoryIcon';
import { LoginPrompt } from '@/components/LoginPrompt';
import { ErrorState, Skeleton, T } from '@/components/ui';

export default function PostTab() {
  const c = useColors();
  const { t } = useI18n();
  const { user } = useAuth();
  const cats = useCategories();
  if (!user) return <LoginPrompt icon="add-circle-outline" text={t('post.login')} />;
  if (cats.isError) return <ErrorState message={errorMessage(cats.error)} onRetry={() => cats.refetch()} />;
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }}>
      <T variant="h3" style={{ marginBottom: 4 }}>
        {t('post.chooseCategory')}
      </T>
      {cats.isLoading
        ? [0, 1, 2, 3].map((i) => <Skeleton key={i} style={{ height: 68, borderRadius: radius.l }} />)
        : cats.data?.map((cat) => (
            <Pressable
              key={cat.slug}
              onPress={() => router.push({ pathname: '/post/[category]', params: { category: cat.slug } })}
              style={({ pressed }) => [styles.row, { backgroundColor: c.card, opacity: pressed ? 0.7 : 1 }]}>
              <View style={[styles.icon, { backgroundColor: c.accentSoft }]}>
                <CategoryIcon icon={cat.icon} color={c.accent} />
              </View>
              <T style={{ flex: 1, fontWeight: '600' }}>{cat.name}</T>
              <Ionicons name="chevron-forward" size={20} color={c.textTertiary} />
            </Pressable>
          ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 12, borderRadius: radius.l },
  icon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
