import AsyncStorage from '@react-native-async-storage/async-storage';
import MapboxGL from '@rnmapbox/maps';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { Stack, useRouter, useSegments } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { fetchMyProfile } from '../src/api/profile';
import { SessionProvider, useSession } from '../src/auth/SessionProvider';
import { WELCOME_SEEN_KEY } from './welcome';

MapboxGL.setAccessToken(process.env.EXPO_PUBLIC_MAPBOX_TOKEN!);

const queryClient = new QueryClient();

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <AuthGate />
      </SessionProvider>
    </QueryClientProvider>
  );
}

/**
 * Routes:
 *   first launch          -> /welcome
 *   signed out            -> /sign-in
 *   signed in, no username -> /onboarding
 *   signed in             -> /(tabs)
 */
function AuthGate() {
  const { session, loading } = useSession();
  const segments = useSegments();
  const router = useRouter();

  const userId = session?.user.id;
  const profile = useQuery({
    queryKey: ['profile', userId],
    queryFn: () => fetchMyProfile(userId!),
    enabled: !!userId,
  });

  // Re-read on every route change so finishing the welcome flow is picked up
  // without a global store; it is a single small key.
  const [welcomeSeen, setWelcomeSeen] = useState<boolean | null>(null);
  useEffect(() => {
    if (welcomeSeen) return;
    AsyncStorage.getItem(WELCOME_SEEN_KEY)
      .then((v) => setWelcomeSeen(!!v))
      .catch(() => setWelcomeSeen(true));
  }, [segments, welcomeSeen]);

  const ready = !loading && welcomeSeen !== null && (!userId || profile.isFetched);

  useEffect(() => {
    if (!ready) return;
    const inAuth = segments[0] === 'sign-in';
    const inWelcome = segments[0] === 'welcome';
    const inOnboarding = segments[0] === 'onboarding';

    if (!session) {
      if (!welcomeSeen && !inWelcome) router.replace('/welcome');
      else if (welcomeSeen && !inAuth && !inWelcome) router.replace('/sign-in');
    } else if (!profile.data?.username) {
      if (!inOnboarding) router.replace('/onboarding');
    } else if (inAuth || inOnboarding || inWelcome) {
      router.replace('/(tabs)');
    }
  }, [ready, session, welcomeSeen, profile.data?.username, segments, router]);

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="welcome" />
      <Stack.Screen name="sign-in" />
      <Stack.Screen name="onboarding" />
      <Stack.Screen name="(tabs)" />
    </Stack>
  );
}
