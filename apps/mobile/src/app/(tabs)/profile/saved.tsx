import { View } from 'react-native';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { useColors } from '@/lib/theme';
import { LoginPrompt } from '@/components/LoginPrompt';
import { SavedSearchList } from '@/components/SavedSearchList';

export default function SavedSearchesScreen() {
  const c = useColors();
  const { t } = useI18n();
  const { user } = useAuth();
  if (!user) return <LoginPrompt icon="bookmark-outline" text={t('fav.login')} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <SavedSearchList />
    </View>
  );
}
