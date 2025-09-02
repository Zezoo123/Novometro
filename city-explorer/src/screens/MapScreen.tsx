import { useEffect, useMemo, useState } from "react";
import { View, Text, Pressable } from "react-native";
import MapboxGL from "@rnmapbox/maps";
import * as Location from "expo-location";
import { useQuery } from "@tanstack/react-query";
import { fetchLondonStations, type Station } from "../api/stations";

// quick haversine (km)
const haversine = (lat1:number, lon1:number, lat2:number, lon2:number) => {
  const R=6371, toRad=(d:number)=>d*Math.PI/180;
  const dLat=toRad(lat2-lat1), dLon=toRad(lon2-lon1);
  const a=Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(a));
};

export default function MapScreen() {
  const [locGranted, setLocGranted] = useState(false);
  const [unlocked, setUnlocked] = useState<Record<string, boolean>>({});

  const { data: stations = [], isLoading, error } = useQuery({
    queryKey: ["stations:london"],
    queryFn: fetchLondonStations
  });

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      setLocGranted(status === "granted");
    })();
  }, []);

  const center = useMemo(() => [-0.1276, 51.5072] as [number, number], []);

  const mockUnlockNearest = async () => {
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    const [lon, lat] = [pos.coords.longitude, pos.coords.latitude];
    let nearest: Station | null = null, best = Infinity;
    for (const s of stations) {
      const d = haversine(lat, lon, s.lat!, s.lon!);
      if (d < best) { best = d; nearest = s; }
    }
    if (nearest) setUnlocked(u => ({ ...u, [nearest!.id]: true }));
  };

  return (
    <View style={{ flex: 1 }}>
      <MapboxGL.MapView style={{ flex: 1 }}>
        <MapboxGL.Camera zoomLevel={12} centerCoordinate={center} />
        {locGranted && <MapboxGL.UserLocation visible />}

        {/* Simple markers (fine for dozens of points) */}
        {stations.map(s => (
          <MapboxGL.PointAnnotation key={s.id} id={s.id} coordinate={[s.lon!, s.lat!]}>
            <View style={{
              width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: "white",
              backgroundColor: unlocked[s.id] ? "#22c55e" : "#3b82f6"
            }} />
          </MapboxGL.PointAnnotation>
        ))}
      </MapboxGL.MapView>

      <View style={{ position: "absolute", bottom: 24, left: 0, right: 0, alignItems: "center" }}>
        <Pressable onPress={mockUnlockNearest}
          style={{ paddingHorizontal:16, paddingVertical:12, backgroundColor:"#111827", borderRadius:12 }}>
          <Text style={{ color:"white", fontWeight:"600" }}>Mock unlock nearest</Text>
        </Pressable>
        {isLoading && <Text style={{ marginTop: 8 }}>Loading stations…</Text>}
        {error && <Text style={{ marginTop: 8, color: "red" }}>{String(error)}</Text>}
      </View>
    </View>
  );
}
