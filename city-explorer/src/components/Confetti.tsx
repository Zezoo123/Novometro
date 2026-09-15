import { useEffect, useMemo } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

const COLOURS = ['#22c55e', '#fbbf24', '#3b82f6', '#ef4444', '#a855f7', '#f97316', '#ffffff'];
const PIECES = 36;
const DURATION = 1800;

type Piece = { x: number; drift: number; delay: number; size: number; colour: string; spin: number };

/**
 * Lightweight celebration: pieces fall from the top for ~2 s and the
 * component unmounts itself via onDone. No native deps.
 */
export function Confetti({ onDone }: { onDone: () => void }) {
  const { width } = Dimensions.get('window');
  const pieces = useMemo<Piece[]>(
    () =>
      Array.from({ length: PIECES }, (_, i) => ({
        x: Math.random() * width,
        drift: (Math.random() - 0.5) * 120,
        delay: Math.random() * 400,
        size: 6 + Math.random() * 8,
        colour: COLOURS[i % COLOURS.length],
        spin: (Math.random() - 0.5) * 720,
      })),
    [width],
  );

  useEffect(() => {
    const t = setTimeout(onDone, DURATION + 500);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {pieces.map((p, i) => (
        <PieceView key={i} piece={p} />
      ))}
    </View>
  );
}

function PieceView({ piece }: { piece: Piece }) {
  const { height } = Dimensions.get('window');
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(piece.delay, withTiming(1, { duration: DURATION, easing: Easing.out(Easing.quad) }));
  }, [piece.delay, progress]);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: piece.x + piece.drift * progress.value },
      { translateY: -20 + (height + 40) * progress.value },
      { rotate: `${piece.spin * progress.value}deg` },
    ],
    opacity: progress.value < 0.85 ? 1 : (1 - progress.value) / 0.15,
  }));

  return (
    <Animated.View
      style={[
        styles.piece,
        { width: piece.size, height: piece.size * 0.6, backgroundColor: piece.colour, borderRadius: piece.size * 0.15 },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  piece: { position: 'absolute', top: 0, left: 0 },
});
