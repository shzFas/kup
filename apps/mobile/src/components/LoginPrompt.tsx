import { goToLogin } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { EmptyState, type IconName } from './ui';

export function LoginPrompt({ text, icon = 'person-circle-outline' }: { text: string; icon?: IconName }) {
  const { t } = useI18n();
  return <EmptyState icon={icon} title={t('login.prompt')} text={text} action={{ title: t('login.signIn'), onPress: goToLogin }} />;
}
