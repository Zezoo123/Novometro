import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { fetchMyProfile, signOut } from '../../src/api/profile';
import { useSession } from '../../src/auth/SessionProvider';

export default function ProfileScreen() {
  const { session } = useSession();
  const userId = session?.user.id;
  const [busy, setBusy] = useState(false);

  const { data: profile } = useQuery({
    queryKey: ['profile', userId],
    queryFn: () => fetchMyProfile(userId!),
    enabled: !!userId,
  });

  const onSignOut = async () => {
    setBusy(true);
    try {
      await signOut();
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.screen}>
      <Text style={styles.username}>@{profile?.username ?? '…'}</Text>
      <Text style={styles.email}>{session?.user.email}</Text>

      <Pressable style={[styles.button, busy && styles.buttonDisabled]} onPress={onSignOut} disabled={busy} testID="sign-out">
        <Text style={styles.buttonText}>Sign out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 24, paddingTop: 80, gap: 8 },
  username: { fontSize: 28, fontWeight: '800' },
  email: { color: '#6b7280', marginBottom: 24 },
  button: { backgroundColor: '#111827', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: 'white', fontWeight: '600' },
});
