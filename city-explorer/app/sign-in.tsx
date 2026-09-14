import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { signInWithEmail, verifyEmailCode } from '../src/api/profile';

type Step = 'email' | 'code';

export default function SignInScreen() {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendCode = async () => {
    setBusy(true);
    setError(null);
    try {
      await signInWithEmail(email);
      setStep('code');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send the code.');
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setBusy(true);
    setError(null);
    try {
      await verifyEmailCode(email, code);
      // The auth gate in app/_layout.tsx redirects once the session lands.
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That code did not work.');
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.card}>
        <Text style={styles.title}>Novometro</Text>
        <Text style={styles.subtitle}>Unlock every station. Complete every line.</Text>

        {step === 'email' ? (
          <>
            <TextInput
              style={styles.input}
              placeholder="you@example.com"
              placeholderTextColor="#9ca3af"
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              textContentType="emailAddress"
              value={email}
              onChangeText={setEmail}
              editable={!busy}
              onSubmitEditing={sendCode}
              testID="email-input"
            />
            <Pressable
              style={[styles.button, (busy || !email.includes('@')) && styles.buttonDisabled]}
              onPress={sendCode}
              disabled={busy || !email.includes('@')}
              testID="send-code"
            >
              {busy ? <ActivityIndicator color="white" /> : <Text style={styles.buttonText}>Send me a code</Text>}
            </Pressable>
          </>
        ) : (
          <>
            <Text style={styles.hint}>We sent a 6-digit code to {email.trim()}.</Text>
            <TextInput
              style={[styles.input, styles.codeInput]}
              placeholder="000000"
              placeholderTextColor="#9ca3af"
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              maxLength={6}
              value={code}
              onChangeText={setCode}
              editable={!busy}
              onSubmitEditing={verify}
              testID="code-input"
            />
            <Pressable
              style={[styles.button, (busy || code.length !== 6) && styles.buttonDisabled]}
              onPress={verify}
              disabled={busy || code.length !== 6}
              testID="verify-code"
            >
              {busy ? <ActivityIndicator color="white" /> : <Text style={styles.buttonText}>Sign in</Text>}
            </Pressable>
            <Pressable onPress={() => { setStep('email'); setCode(''); setError(null); }} disabled={busy}>
              <Text style={styles.link}>Use a different email</Text>
            </Pressable>
          </>
        )}

        {error && <Text style={styles.error}>{error}</Text>}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#111827', justifyContent: 'center', padding: 24 },
  card: { gap: 12 },
  title: { color: 'white', fontSize: 40, fontWeight: '800' },
  subtitle: { color: '#d1d5db', fontSize: 16, marginBottom: 12 },
  hint: { color: '#d1d5db' },
  input: {
    backgroundColor: 'white',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#111827',
  },
  codeInput: { fontSize: 28, letterSpacing: 8, textAlign: 'center', fontVariant: ['tabular-nums'] },
  button: { backgroundColor: '#22c55e', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: 'white', fontWeight: '700', fontSize: 16 },
  link: { color: '#93c5fd', textAlign: 'center', marginTop: 8 },
  error: { color: '#fca5a5', marginTop: 8 },
});
