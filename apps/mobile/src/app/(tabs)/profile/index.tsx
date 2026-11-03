import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import Constants from 'expo-constants';
import { api, API_URL, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatMonthYear, formatPhone } from '@/lib/format';
import { radius, useColors } from '@/lib/theme';
import { LoginPrompt } from '@/components/LoginPrompt';
import { Button, Card, Divider, Row, T } from '@/components/ui';

export default function ProfileScreen() {
  const c = useColors();
  const { user, setUser, logout } = useAuth();
  const [name, setName] = useState(user?.name ?? '');
  const [saving, setSaving] = useState(false);
  useEffect(() => setName(user?.name ?? ''), [user?.name]);

  const version = Constants.expoConfig?.version ?? '—';
  const footer = (
    <T variant="caption" color="tertiary" style={{ textAlign: 'center', marginTop: 24 }}>
      kup · версия {version}
      {__DEV__ ? `\n${API_URL}` : ''}
    </T>
  );

  if (!user)
    return (
      <View style={{ flex: 1 }}>
        <LoginPrompt text="Войдите, чтобы подавать объявления, сохранять избранное и звонить продавцам" />
        <View style={{ paddingBottom: 24 }}>{footer}</View>
      </View>
    );

  const save = async () => {
    setSaving(true);
    try {
      setUser(await api.updateMe({ name: name.trim() }));
    } catch (e) {
      Alert.alert('Не удалось сохранить', errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const confirmLogout = () =>
    Alert.alert('Выйти из аккаунта?', undefined, [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Выйти', style: 'destructive', onPress: () => logout() },
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
          <T variant="h2">{user.name || 'Без имени'}</T>
          <T color="secondary">{formatPhone(user.phone)}</T>
          {user.created_at && (
            <T variant="small" color="tertiary">
              На kup с {formatMonthYear(user.created_at)}
            </T>
          )}
        </View>
        <Card style={{ padding: 16, gap: 10 }}>
          <T style={{ fontWeight: '600' }}>Имя</T>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Как к вам обращаться"
            placeholderTextColor={c.textTertiary}
            style={[styles.input, { backgroundColor: c.fill, color: c.text }]}
            maxLength={60}
            returnKeyType="done"
            onSubmitEditing={dirty ? save : undefined}
          />
          <Button title="Сохранить" onPress={save} loading={saving} disabled={!dirty} />
        </Card>
        <Card>
          <Row icon="log-out-outline" title="Выйти" danger onPress={confirmLogout} />
          <Divider />
          <Row icon="information-circle-outline" title="Версия приложения" value={version} />
        </Card>
        {footer}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  head: { alignItems: 'center', gap: 4, paddingVertical: 12 },
  avatar: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  input: { height: 46, borderRadius: radius.s, paddingHorizontal: 12, fontSize: 16 },
});
