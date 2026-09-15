import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Dimensions, FlatList, Pressable, StyleSheet, Text, View, type ViewToken } from 'react-native';

export const WELCOME_SEEN_KEY = 'novometro.welcomeSeen.v1';

type Slide = { emoji: string; title: string; body: string; colour: string };

const SLIDES: Slide[] = [
  {
    emoji: '🚇',
    title: 'Unlock every station',
    body: 'Stand at a station, check in, and it lights up on your map. For good.',
    colour: '#0098D4',
  },
  {
    emoji: '🏁',
    title: 'Complete the lines',
    body: 'Finish all 16 stops on the Victoria line and earn a card worth posting.',
    colour: '#E32017',
  },
  {
    emoji: '🏆',
    title: 'Race your friends',
    body: 'Weekly challenges, streaks, and a leaderboard for London. Who explores more?',
    colour: '#22c55e',
  },
];

export default function WelcomeScreen() {
  const router = useRouter();
  const { width } = Dimensions.get('window');
  const [index, setIndex] = useState(0);
  const list = useRef<FlatList<Slide>>(null);

  const onViewable = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const i = viewableItems[0]?.index;
    if (typeof i === 'number') setIndex(i);
  }).current;

  const finish = async () => {
    await AsyncStorage.setItem(WELCOME_SEEN_KEY, '1').catch(() => {});
    router.replace('/sign-in');
  };

  const next = () => {
    if (index < SLIDES.length - 1) list.current?.scrollToIndex({ index: index + 1, animated: true });
    else finish();
  };

  return (
    <View style={[styles.screen, { backgroundColor: SLIDES[index].colour }]}>
      <Pressable onPress={finish} style={styles.skip} hitSlop={12} testID="welcome-skip">
        <Text style={styles.skipText}>Skip</Text>
      </Pressable>
      <FlatList
        ref={list}
        data={SLIDES}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(s) => s.title}
        onViewableItemsChanged={onViewable}
        viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
        renderItem={({ item }) => (
          <View style={[styles.slide, { width }]}>
            <Text style={styles.emoji}>{item.emoji}</Text>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.body}>{item.body}</Text>
          </View>
        )}
      />
      <View style={styles.footer}>
        <View style={styles.dots}>
          {SLIDES.map((s, i) => (
            <View key={s.title} style={[styles.dot, i === index && styles.dotActive]} />
          ))}
        </View>
        <Pressable onPress={next} style={styles.button} testID="welcome-next">
          <Text style={[styles.buttonText, { color: SLIDES[index].colour }]}>
            {index === SLIDES.length - 1 ? 'Get started' : 'Next'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  skip: { position: 'absolute', top: 60, right: 24, zIndex: 1 },
  skipText: { color: 'rgba(255,255,255,0.8)', fontWeight: '600' },
  slide: { flex: 1, justifyContent: 'center', padding: 32, gap: 16 },
  emoji: { fontSize: 88 },
  title: { color: 'white', fontSize: 40, fontWeight: '900', lineHeight: 44 },
  body: { color: 'rgba(255,255,255,0.9)', fontSize: 18, lineHeight: 26 },
  footer: { padding: 24, paddingBottom: 48, gap: 20 },
  dots: { flexDirection: 'row', gap: 8, justifyContent: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.4)' },
  dotActive: { backgroundColor: 'white', width: 24 },
  button: { backgroundColor: 'white', borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  buttonText: { fontWeight: '800', fontSize: 16 },
});
