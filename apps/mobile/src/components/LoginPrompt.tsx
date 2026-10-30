import { goToLogin } from '@/lib/auth';
import { EmptyState, type IconName } from './ui';

export function LoginPrompt({ text, icon = 'person-circle-outline' }: { text: string; icon?: IconName }) {
  return <EmptyState icon={icon} title="Войдите в аккаунт" text={text} action={{ title: 'Войти', onPress: goToLogin }} />;
}
