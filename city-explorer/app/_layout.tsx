import MapboxGL from '@rnmapbox/maps';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { Stack, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { fetchMyProfile } from '../src/api/profile';
import { SessionProvider, useSession } from '../src/auth/SessionProvider';

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

  const ready = !loading && (!userId || profile.isFetched);

  useEffect(() => {
    if (!ready) return;
    const inAuth = segments[0] === 'sign-in';
    const inOnboarding = segments[0] === 'onboarding';

    if (!session) {
      if (!inAuth) router.replace('/sign-in');
    } else if (!profile.data?.username) {
      if (!inOnboarding) router.replace('/onboarding');
    } else if (inAuth || inOnboarding) {
      router.replace('/(tabs)');
    }
  }, [ready, session, profile.data?.username, segments, router]);

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="sign-in" />
      <Stack.Screen name="onboarding" />
      <Stack.Screen name="(tabs)" />
    </Stack>
  );
}
