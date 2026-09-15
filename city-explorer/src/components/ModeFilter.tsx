import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { MODE_COLOUR, MODE_LABEL, MODES, type Mode } from '../lib/mapFilters';

type Props = {
  selected: Mode[];
  onToggle: (mode: Mode) => void;
  /** Modes that have no data yet are shown disabled. */
  available: Set<string>;
};

export function ModeFilter({ selected, onToggle, available }: Props) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.scroll}
      contentContainerStyle={styles.row}
      pointerEvents="box-none"
    >
      {MODES.map((mode) => {
        const on = selected.includes(mode);
        const has = available.has(mode);
        return (
          <Pressable
            key={mode}
            onPress={() => has && onToggle(mode)}
            style={[
              styles.chip,
              on && { backgroundColor: MODE_COLOUR[mode], borderColor: MODE_COLOUR[mode] },
              !has && styles.chipDisabled,
            ]}
            testID={`mode-${mode}`}
          >
            <Text style={[styles.chipText, on && styles.chipTextOn]}>
              {MODE_LABEL[mode]}
              {!has && ' · soon'}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { position: 'absolute', top: 56, left: 0, right: 0 },
  row: { paddingHorizontal: 16, gap: 8 },
  chip: {
    backgroundColor: 'white',
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: '#e5e7eb',
    paddingHorizontal: 14,
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  chipDisabled: { opacity: 0.5 },
  chipText: { fontWeight: '700', color: '#111827', fontSize: 13 },
  chipTextOn: { color: 'white' },
});
