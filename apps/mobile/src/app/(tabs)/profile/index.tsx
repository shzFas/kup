import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import { api, API_URL, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatPhone } from '@/lib/format';
import { LANGS, setLang, useI18n } from '@/lib/i18n';
import { useSavedSearchesNew, useUnreadNotifications } from '@/lib/queries';
import { radius, useColors } from '@/lib/theme';
import { LoginPrompt } from '@/components/LoginPrompt';
import { Sheet } from '@/components/Sheet';
import { Badge, Button, Card, Divider, Row, T, type IconName } from '@/components/ui';

export default function ProfileScreen() {
  const c = useColors();
  const { t, monthYear, lang } = useI18n();
  const { user, setUser, logout } = useAuth();
  const [name, setName] = useState(user?.name ?? '');
  const [saving, setSaving] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const unread = useUnreadNotifications();
  const savedNew = useSavedSearchesNew();
  useEffect(() => setName(user?.name ?? ''), [user?.name]);

  const version = Constants.expoConfig?.version ?? '—';
  const footer = (
    <T variant="caption" color="tertiary" style={{ textAlign: 'center', marginTop: 24 }}>
      {t('profile.footer', { version })}
      {__DEV__ ? `\n${API_URL}` : ''}
    </T>
  );
  const langName = LANGS.find((l) => l.code === lang)?.name ?? lang;
  const langRow = <Row icon="language-outline" title={t('profile.language')} value={langName} onPress={() => setLangOpen(true)} />;
  const langSheet = (
    <Sheet visible={langOpen} onClose={() => setLangOpen(false)} title={t('profile.languageTitle')}>
      {LANGS.map((l) => (
        <Pressable
          key={l.code}
          onPress={() => {
            setLangOpen(false);
            void setLang(l.code);
          }}
          style={({ pressed }) => [styles.langRow, { opacity: pressed ? 0.6 : 1 }]}>
          <T style={{ flex: 1, fontWeight: l.code === lang ? '600' : '400' }}>{l.name}</T>
          {l.code === lang && <Ionicons name="checkmark" size={22} color={c.accent} />}
        </Pressable>
      ))}
    </Sheet>
  );

  if (!user)
    return (
      <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 16 }}>
        <View style={{ flex: 1 }}>
          <LoginPrompt text={t('profile.login')} />
        </View>
        <Card>{langRow}</Card>
        {footer}
        {langSheet}
      </ScrollView>
    );

  const save = async () => {
    setSaving(true);
    try {
      setUser(await api.updateMe({ name: name.trim() }));
    } catch (e) {
      Alert.alert(t('profile.saveFailed'), errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const confirmLogout = () =>
    Alert.alert(t('profile.logoutQ'), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('profile.logout'), style: 'destructive', onPress: () => logout() },
    ]);

  const dirty = name.trim() !== (user.name ?? '');

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }} keyboardShouldPersistTaps="handled">
        <View style={styles.head}>
          <View style={[styles.avatar, { backgroundColor: c.accentSoft }]}>
            <T variant="title" color="accent">
              {(user.name || '?').slice(0, 1).toUpperCase()}
            </T>
          </View>
          <T variant="h2">{user.name || t('profile.noName')}</T>
          <T color="secondary">{formatPhone(user.phone)}</T>
          {user.created_at && (
            <T variant="small" color="tertiary">
              {t('profile.since', { date: monthYear(user.created_at) })}
            </T>
          )}
        </View>
        <Card>
          <NavRow icon="list-outline" title={t('nav.my')} href="/profile/my" />
          <Divider inset={48} />
          <NavRow icon="bookmark-outline" title={t('nav.saved')} href="/profile/saved" badge={savedNew} />
          <Divider inset={48} />
          <NavRow icon="notifications-outline" title={t('nav.notifications')} href="/profile/notifications" badge={unread} />
        </Card>
        <Card style={{ padding: 16, gap: 10 }}>
          <T style={{ fontWeight: '600' }}>{t('profile.name')}</T>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder={t('profile.namePlaceholder')}
            placeholderTextColor={c.textTertiary}
            style={[styles.input, { backgroundColor: c.fill, color: c.text }]}
            maxLength={60}
            returnKeyType="done"
            onSubmitEditing={dirty ? save : undefined}
          />
          <Button title={t('common.save')} onPress={save} loading={saving} disabled={!dirty} />
        </Card>
        <Card>
          {langRow}
          <Divider />
          <Row icon="log-out-outline" title={t('profile.logout')} danger onPress={confirmLogout} />
          <Divider />
          <Row icon="information-circle-outline" title={t('profile.version')} value={version} />
        </Card>
        {footer}
      </ScrollView>
      {langSheet}
    </KeyboardAvoidingView>
  );
}

function NavRow({ icon, title, href, badge = 0 }: { icon: IconName; title: string; href: string; badge?: number }) {
  const c = useColors();
  return (
    <Pressable onPress={() => router.push(href as never)} style={({ pressed }) => [styles.nav, { opacity: pressed ? 0.6 : 1 }]}>
      <Ionicons name={icon} size={20} color={c.textSecondary} />
      <T style={{ flex: 1 }}>{title}</T>
      <Badge n={badge} />
      <Ionicons name="chevron-forward" size={18} color={c.textTertiary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  head: { alignItems: 'center', gap: 4, paddingVertical: 12 },
  avatar: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  input: { height: 46, borderRadius: radius.s, paddingHorizontal: 12, fontSize: 16 },
  nav: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, minHeight: 52 },
  langRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, height: 50 },
});
