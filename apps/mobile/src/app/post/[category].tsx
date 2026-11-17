import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { View } from 'react-native';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useSchema } from '@/lib/queries';
import { useI18n } from '@/lib/i18n';
import { useColors } from '@/lib/theme';
import { ListingForm } from '@/components/form/ListingForm';
import { LoginPrompt } from '@/components/LoginPrompt';
import { ErrorState, Loading } from '@/components/ui';

export default function NewListingScreen() {
  const { category } = useLocalSearchParams<{ category: string }>();
  const c = useColors();
  const { t } = useI18n();
  const qc = useQueryClient();
  const { user } = useAuth();
  const schema = useSchema(category);

  let body;
  if (!user) body = <LoginPrompt text={t('post.login')} />;
  else if (schema.isPending) body = <Loading />;
  else if (schema.isError) body = <ErrorState message={errorMessage(schema.error)} onRetry={() => schema.refetch()} />;
  else
    body = (
      <ListingForm
        schema={schema.data}
        submitLabel={t('post.publish')}
        onSubmit={async (input) => {
          const l = await api.createListing(input);
          qc.setQueryData(['listing', l.id], l);
          qc.invalidateQueries({ queryKey: ['my'] });
          qc.invalidateQueries({ queryKey: ['search'] });
          qc.invalidateQueries({ queryKey: ['fresh'] });
          router.replace({ pathname: '/listing/[id]', params: { id: l.id } });
          return l;
        }}
      />
    );

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <Stack.Screen options={{ title: schema.data ? schema.data.name : t('nav.newListing') }} />
      {body}
    </View>
  );
}
