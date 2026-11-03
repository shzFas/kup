import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View, type TextInputInstance } from 'react-native';
import { router, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { api, ApiError, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { resetFavoriteOverrides } from '@/lib/favorites';
import { useI18n } from '@/lib/i18n';
import { COUNTRIES, countryName, DEFAULT_COUNTRY, isComplete, maskDigits, parseInput, placeholder, toE164, type Country } from '@/lib/phone';
import { radius, useColors } from '@/lib/theme';
import { CheckRow } from '@/components/Check';
import { Sheet } from '@/components/Sheet';
import { Button, T } from '@/components/ui';

export default function LoginScreen() {
  const c = useColors();
  const { t } = useI18n();
  const qc = useQueryClient();
  const { setUser } = useAuth();
  const [country, setCountry] = useState<Country>(DEFAULT_COUNTRY);
  const [countryOpen, setCountryOpen] = useState(false);
  const [digits, setDigits] = useState('');
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState<string | undefined>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [retryIn, setRetryIn] = useState(0);
  const codeRef = useRef<TextInputInstance>(null);
  const phone = toE164(country, digits);
  const pretty = `+${country.code} ${maskDigits(country, digits)}`;

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
        setError(t('login.alreadySent'));
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
      setError(e instanceof ApiError && e.code === 'invalid_code' ? t('login.invalidCode') : errorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.card }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen
        options={{
          title: t('nav.login'),
          headerLeft: () => (
            <Pressable onPress={() => router.back()} hitSlop={10}>
              <T color="accent">{t('common.cancel')}</T>
            </Pressable>
          ),
        }}
      />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {step === 'phone' ? (
          <>
            <T variant="h2">{t('login.title')}</T>
            <T color="secondary">{t('login.subtitle')}</T>
            <View style={[styles.field, { backgroundColor: c.fill }]}>
              <Pressable
                onPress={() => setCountryOpen(true)}
                style={styles.country}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel={`${t('login.country')}: ${t(countryName(country))}`}>
                <T style={styles.flag}>{country.flag}</T>
                <T style={styles.prefix}>+{country.code}</T>
                <Ionicons name="chevron-down" size={16} color={c.textSecondary} />
              </Pressable>
              <View style={[styles.sep, { backgroundColor: c.border }]} />
              <TextInput
                autoFocus
                value={maskDigits(country, digits)}
                onChangeText={(text) => {
                  const r = parseInput(country, text);
                  setCountry(r.country);
                  setDigits(r.digits);
                  setError('');
                }}
                keyboardType="phone-pad"
                textContentType="telephoneNumber"
                autoComplete="tel"
                placeholder={placeholder(country)}
                placeholderTextColor={c.textTertiary}
                style={[styles.input, { color: c.text }]}
              />
            </View>
            {!!error && <T color="danger">{error}</T>}
            <Button title={t('login.getCode')} onPress={requestCode} loading={loading} disabled={!isComplete(country, digits)} />
          </>
        ) : (
          <>
            <T variant="h2">{t('login.enterCode')}</T>
            <T color="secondary">{t('login.sentTo', { phone: pretty })}</T>
            {devCode && (
              <View style={[styles.hint, { backgroundColor: c.accentSoft }]}>
                <T variant="small" color="accent">
                  {t('login.devCode', { code: devCode })}
                </T>
              </View>
            )}
            <TextInput
              ref={codeRef}
              value={code}
              onChangeText={(text) => {
                const v = text.replace(/\D/g, '').slice(0, 6);
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
            <Button title={t('login.signIn')} onPress={() => verify()} loading={loading} disabled={code.length < 4} />
            <View style={styles.links}>
              <Pressable onPress={() => (setStep('phone'), setCode(''), setError(''))}>
                <T color="accent">{t('login.changeNumber')}</T>
              </Pressable>
              {retryIn > 0 ? (
                <T color="tertiary">{t('login.retryIn', { n: retryIn })}</T>
              ) : (
                <Pressable onPress={requestCode}>
                  <T color="accent">{t('login.resend')}</T>
                </Pressable>
              )}
            </View>
          </>
        )}
      </ScrollView>
      <Sheet visible={countryOpen} onClose={() => setCountryOpen(false)} title={t('login.country')}>
        <ScrollView style={{ maxHeight: 480 }} contentContainerStyle={{ paddingHorizontal: 16 }}>
          {COUNTRIES.map((x) => (
            <CheckRow
              key={x.iso}
              radio
              checked={x.iso === country.iso}
              label={`${x.flag}  ${t(countryName(x))}`}
              subtitle={`+${x.code}`}
              onPress={() => {
                setCountry(x);
                setDigits((d) => d.slice(0, Math.max(...x.lengths)));
                setCountryOpen(false);
              }}
            />
          ))}
        </ScrollView>
      </Sheet>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, gap: 14 },
  field: { flexDirection: 'row', alignItems: 'center', borderRadius: radius.m, paddingHorizontal: 14, height: 54, marginTop: 8 },
  country: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 54 },
  flag: { fontSize: 22 },
  prefix: { fontSize: 20, fontWeight: '500' },
  sep: { width: StyleSheet.hairlineWidth, height: 28, marginHorizontal: 10 },
  input: { flex: 1, fontSize: 20, height: 54, letterSpacing: 0.5 },
  code: { height: 60, borderRadius: radius.m, fontSize: 28, textAlign: 'center', letterSpacing: 12, marginTop: 8 },
  hint: { padding: 12, borderRadius: radius.m },
  links: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
});
