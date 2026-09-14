import { useQueryClient } from '@tanstack/react-query';
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
import { setUsername, USERNAME_RULE, UsernameTakenError } from '../src/api/profile';
import { useSession } from '../src/auth/SessionProvider';

export default function OnboardingScreen() {
  const { session } = useSession();
  const queryClient = useQueryClient();
  const [username, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clean = username.trim().toLowerCase();
  const valid = USERNAME_RULE.test(clean);

  const save = async () => {
    if (!session || !valid) return;
    setBusy(true);
    setError(null);
    try {
      const profile = await setUsername(session.user.id, clean);
      queryClient.setQueryData(['profile', session.user.id], profile);
      // The auth gate redirects to the tabs once the profile has a username.
    } catch (e) {
      setError(e instanceof UsernameTakenError ? 'That username is taken.' : 'Could not save. Try again.');
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.card}>
        <Text style={styles.title}>Pick a username</Text>
        <Text style={styles.subtitle}>This is how friends will find you on leaderboards.</Text>
        <TextInput
          style={styles.input}
          placeholder="tube_legend"
          placeholderTextColor="#9ca3af"
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={20}
          value={username}
          onChangeText={setName}
          editable={!busy}
          onSubmitEditing={save}
          testID="username-input"
        />
        <Text style={styles.hint}>3 to 20 characters: lowercase letters, numbers, underscores.</Text>
        <Pressable
          style={[styles.button, (busy || !valid) && styles.buttonDisabled]}
          onPress={save}
          disabled={busy || !valid}
          testID="save-username"
        >
          {busy ? <ActivityIndicator color="white" /> : <Text style={styles.buttonText}>Let&apos;s go</Text>}
        </Pressable>
        {error && <Text style={styles.error}>{error}</Text>}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#111827', justifyContent: 'center', padding: 24 },
  card: { gap: 12 },
  title: { color: 'white', fontSize: 32, fontWeight: '800' },
  subtitle: { color: '#d1d5db', fontSize: 16 },
  hint: { color: '#9ca3af', fontSize: 13 },
  input: {
    backgroundColor: 'white',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 18,
    color: '#111827',
  },
  button: { backgroundColor: '#22c55e', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: 'white', fontWeight: '700', fontSize: 16 },
  error: { color: '#fca5a5', marginTop: 8 },
});
