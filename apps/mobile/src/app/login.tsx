import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View, type TextInputInstance } from 'react-native';
import { router, Stack } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { api, ApiError, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { resetFavoriteOverrides } from '@/lib/favorites';
import { radius, useColors } from '@/lib/theme';
import { Button, T } from '@/components/ui';

/** "7011234567" → "(701) 123-45-67" */
function maskPhone(d: string) {
  let s = '';
  if (d.length > 0) s += '(' + d.slice(0, 3);
  if (d.length >= 3) s += ') ';
  if (d.length > 3) s += d.slice(3, 6);
  if (d.length > 6) s += '-' + d.slice(6, 8);
  if (d.length > 8) s += '-' + d.slice(8, 10);
  return s;
}

export default function LoginScreen() {
  const c = useColors();
  const qc = useQueryClient();
  const { setUser } = useAuth();
  const [digits, setDigits] = useState('');
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState<string | undefined>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [retryIn, setRetryIn] = useState(0);
  const codeRef = useRef<TextInputInstance>(null);
  const phone = '+7' + digits;

  useEffect(() => {
    if (retryIn <= 0) return;
    const t = setTimeout(() => setRetryIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [retryIn]);

  const requestCode = async () => {
    setError('');
    setLoading(true);
    try {
      const r = await api.requestOtp(phone);
      setStep('code');
      setRetryIn(r.retry_after_sec || 60);
      setDevCode(r.dev_code);
      if (r.dev_code) setCode(r.dev_code);
      setTimeout(() => codeRef.current?.focus(), 300);
    } catch (e) {
      if (e instanceof ApiError && e.status === 429) {
        setStep('code');
        setError('Код уже отправлен. Повторно запросить можно чуть позже.');
      } else setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const verify = async (value = code) => {
    if (!value) return;
    setError('');
    setLoading(true);
    try {
      const r = await api.verifyOtp(phone, value);
      setUser(r.user);
      resetFavoriteOverrides();
      // Refetch everything that depends on the viewer (is_favorite, is_owner...).
      qc.invalidateQueries();
      router.back();
    } catch (e) {
      setError(e instanceof ApiError && e.code === 'invalid_code' ? 'Неверный код' : errorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.card }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen
        options={{
          title: 'Вход',
          headerLeft: () => (
            <Pressable onPress={() => router.back()} hitSlop={10}>
              <T color="accent">Отмена</T>
            </Pressable>
          ),
        }}
      />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {step === 'phone' ? (
          <>
            <T variant="h2">Вход или регистрация</T>
            <T color="secondary">Мы отправим код подтверждения в SMS</T>
            <View style={[styles.field, { backgroundColor: c.fill }]}>
              <T style={styles.prefix}>+7</T>
              <TextInput
                autoFocus
                value={maskPhone(digits)}
                onChangeText={(t) => {
                  let d = t.replace(/\D/g, '');
                  // Pasted full number: drop leading 7/8.
                  if (d.length > 10 && (d.startsWith('7') || d.startsWith('8'))) d = d.slice(1);
                  setDigits(d.slice(0, 10));
                  setError('');
                }}
                keyboardType="phone-pad"
                textContentType="telephoneNumber"
                autoComplete="tel"
                placeholder="(700) 000-00-00"
                placeholderTextColor={c.textTertiary}
                style={[styles.input, { color: c.text }]}
              />
            </View>
            {!!error && <T color="danger">{error}</T>}
            <Button title="Получить код" onPress={requestCode} loading={loading} disabled={digits.length !== 10} />
          </>
        ) : (
          <>
            <T variant="h2">Введите код</T>
            <T color="secondary">Отправили на +7 {maskPhone(digits)}</T>
            {devCode && (
              <View style={[styles.hint, { backgroundColor: c.accentSoft }]}>
                <T variant="small" color="accent">
                  Режим разработки: код {devCode} подставлен автоматически
                </T>
              </View>
            )}
            <TextInput
              ref={codeRef}
              value={code}
              onChangeText={(t) => {
                const v = t.replace(/\D/g, '').slice(0, 6);
                setCode(v);
                setError('');
                if (devCode ? v.length === devCode.length : v.length === 4) verify(v);
              }}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="sms-otp"
              placeholder="••••"
              placeholderTextColor={c.textTertiary}
              style={[styles.code, { backgroundColor: c.fill, color: c.text }]}
              maxLength={6}
            />
            {!!error && <T color="danger">{error}</T>}
            <Button title="Войти" onPress={() => verify()} loading={loading} disabled={code.length < 4} />
            <View style={styles.links}>
              <Pressable onPress={() => (setStep('phone'), setCode(''), setError(''))}>
                <T color="accent">Изменить номер</T>
              </Pressable>
              {retryIn > 0 ? (
                <T color="tertiary">Повторно через {retryIn} с</T>
              ) : (
                <Pressable onPress={requestCode}>
                  <T color="accent">Отправить ещё раз</T>
                </Pressable>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, gap: 14 },
  field: { flexDirection: 'row', alignItems: 'center', borderRadius: radius.m, paddingHorizontal: 14, height: 54, marginTop: 8 },
  prefix: { fontSize: 20, fontWeight: '500', marginRight: 8 },
  input: { flex: 1, fontSize: 20, height: 54, letterSpacing: 0.5 },
  code: { height: 60, borderRadius: radius.m, fontSize: 28, textAlign: 'center', letterSpacing: 12, marginTop: 8 },
  hint: { padding: 12, borderRadius: radius.m },
  links: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
});
