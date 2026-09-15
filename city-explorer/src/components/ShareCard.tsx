import { Image } from 'expo-image';
import { forwardRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { Achievement } from '../api/achievements';

export type ShareCardProps = {
  achievement: Achievement;
  username: string;
  earnedAt: string;
  /** Line colour when the achievement is a line completion; otherwise the brand colour. */
  colour: string;
  /** e.g. "16 stations" for a line, "469 stations" for the city. */
  detail?: string;
  /** Up to nine photo URLs from the line, shown as a strip under the title. */
  photos?: string[];
};

export const CARD_WIDTH = 360;
export const CARD_HEIGHT = 360;

/**
 * The image people post. Rendered at a fixed size so captures are consistent
 * regardless of the phone. Keep it self-contained: no network images.
 */
export const ShareCard = forwardRef<View, ShareCardProps>(function ShareCard(
  { achievement, username, earnedAt, colour, detail, photos = [] },
  ref,
) {
  const date = new Date(earnedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
  return (
    <View ref={ref} collapsable={false} style={[styles.card, { backgroundColor: colour }]}>
      <View style={styles.stripe} />
      <View style={styles.body}>
        <Text style={styles.kicker}>{kicker(achievement)}</Text>
        <Text style={styles.title} numberOfLines={3} adjustsFontSizeToFit>
          {achievement.name}
        </Text>
        {photos.length === 0 && <Text style={styles.description}>{achievement.description}</Text>}
        {detail && <Text style={styles.detail}>{detail}</Text>}
      </View>
      {photos.length > 0 && (
        <View style={styles.collage}>
          {photos.slice(0, 9).map((uri, i) => (
            <Image key={i} source={{ uri }} style={[styles.tile, photos.length <= 3 && styles.tileLarge]} contentFit="cover" />
          ))}
        </View>
      )}
      <View style={styles.footer}>
        <View>
          <Text style={styles.handle}>@{username}</Text>
          <Text style={styles.date}>{date}</Text>
        </View>
        <View style={styles.brand}>
          <View style={styles.roundel}>
            <View style={styles.roundelBar} />
          </View>
          <Text style={styles.brandText}>Novometro</Text>
        </View>
      </View>
    </View>
  );
});

function kicker(a: Achievement): string {
  switch (a.kind) {
    case 'line_complete':
      return 'LINE COMPLETE';
    case 'all_lines':
      return 'NETWORK COMPLETE';
    case 'explorer':
      return 'EXPLORER';
    case 'station_regular':
      return 'REGULAR';
    default:
      return 'ACHIEVEMENT';
  }
}

const styles = StyleSheet.create({
  card: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: 24,
    padding: 24,
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  stripe: {
    position: 'absolute',
    right: -60,
    top: -60,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  body: { gap: 8 },
  kicker: { color: 'rgba(255,255,255,0.85)', fontWeight: '800', letterSpacing: 2, fontSize: 12 },
  title: { color: 'white', fontSize: 40, fontWeight: '900', lineHeight: 44 },
  description: { color: 'rgba(255,255,255,0.85)', fontSize: 16, marginTop: 4 },
  detail: { color: 'rgba(255,255,255,0.9)', fontSize: 18, fontWeight: '600' },
  collage: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginVertical: 8 },
  tile: { width: 62, height: 62, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.2)', borderWidth: 2, borderColor: 'rgba(255,255,255,0.7)' },
  tileLarge: { width: 96, height: 96, borderRadius: 14 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  handle: { color: 'white', fontWeight: '800', fontSize: 16 },
  date: { color: 'rgba(255,255,255,0.8)', fontSize: 13, marginTop: 2 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  roundel: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 5,
    borderColor: 'white',
    alignItems: 'center',
    justifyContent: 'center',
  },
  roundelBar: { width: 34, height: 6, backgroundColor: 'white', position: 'absolute' },
  brandText: { color: 'white', fontWeight: '800', fontSize: 16 },
});
