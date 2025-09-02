import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MapboxGL from '@rnmapbox/maps';
import MapScreen from './src/screens/MapScreen';

MapboxGL.setAccessToken(process.env.EXPO_PUBLIC_MAPBOX_TOKEN!);

const qc = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <MapScreen />
    </QueryClientProvider>
  );
}
