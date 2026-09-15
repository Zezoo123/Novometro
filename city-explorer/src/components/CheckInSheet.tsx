import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { Station } from '../api/stations';

type Props = {
  station: Station;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (photo?: { uri: string; caption?: string }) => void;
};

/**
 * The moment of check-in. Take a photo (the default, it is the whole point),
 * pick one, or check in without. Photo check-ins earn +20 XP.
 */
export function CheckInSheet({ station, busy, onCancel, onSubmit }: Props) {
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [error, setError] = useState<string | null>(null);

  const pick = async (source: 'camera' | 'library') => {
    setError(null);
    try {
      const perm =
        source === 'camera'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        setError(source === 'camera' ? 'Camera access is off. You can still check in without a photo.' : 'Photo library access is off.');
        return;
      }
      const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.9, allowsEditing: false, exif: false };
      const result =
        source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
      if (!result.canceled && result.assets[0]) setPhotoUri(result.assets[0].uri);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open the camera.');
    }
  };

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onCancel}>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={StyleSheet.absoluteFill} onPress={busy ? undefined : onCancel} />
        <View style={styles.sheet} testID="check-in-sheet">
          <View style={styles.handle} />
          <Text style={styles.title}>Check in at {station.name}</Text>

          {photoUri ? (
            <>
              <Image source={{ uri: photoUri }} style={styles.preview} contentFit="cover" />
              <TextInput
                style={styles.caption}
                placeholder="Say something (optional)"
                placeholderTextColor="#9ca3af"
                value={caption}
                onChangeText={(t) => setCaption(t.slice(0, 280))}
                maxLength={280}
                multiline
                editable={!busy}
                testID="caption-input"
              />
              <Pressable
                style={[styles.primary, busy && styles.disabled]}
                disabled={busy}
                onPress={() => onSubmit({ uri: photoUri, caption: caption.trim() || undefined })}
                testID="post-check-in"
              >
                {busy ? <ActivityIndicator color="white" /> : <Text style={styles.primaryText}>Post check-in · +20 XP</Text>}
              </Pressable>
              <Pressable onPress={() => setPhotoUri(null)} disabled={busy} hitSlop={8}>
                <Text style={styles.link}>Retake</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.subtitle}>Snap a photo here. It goes on the station wall and your friends&apos; feed.</Text>
              <Pressable style={[styles.primary, busy && styles.disabled]} disabled={busy} onPress={() => pick('camera')} testID="take-photo">
                <Text style={styles.primaryText}>📸 Take a photo</Text>
              </Pressable>
              <View style={styles.row}>
                <Pressable style={[styles.secondary, busy && styles.disabled]} disabled={busy} onPress={() => pick('library')} testID="choose-photo">
                  <Text style={styles.secondaryText}>Choose from library</Text>
                </Pressable>
                <Pressable style={[styles.secondary, busy && styles.disabled]} disabled={busy} onPress={() => onSubmit()} testID="check-in-no-photo">
                  {busy ? <ActivityIndicator /> : <Text style={styles.secondaryText}>No photo</Text>}
                </Pressable>
              </View>
            </>
          )}

          {error && <Text style={styles.error}>{error}</Text>}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    backgroundColor: 'white',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: 20,
    paddingBottom: 36,
    gap: 12,
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#e5e7eb' },
  title: { fontSize: 20, fontWeight: '800' },
  subtitle: { color: '#6b7280' },
  preview: { width: '100%', aspectRatio: 1, borderRadius: 16, backgroundColor: '#e5e7eb' },
  caption: { backgroundColor: '#f3f4f6', borderRadius: 12, padding: 12, minHeight: 48, fontSize: 15 },
  primary: { backgroundColor: '#22c55e', borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  primaryText: { color: 'white', fontWeight: '800', fontSize: 16 },
  row: { flexDirection: 'row', gap: 10 },
  secondary: { flex: 1, backgroundColor: '#f3f4f6', borderRadius: 14, paddingVertical: 13, alignItems: 'center' },
  secondaryText: { color: '#111827', fontWeight: '700' },
  link: { color: '#6b7280', textAlign: 'center', paddingVertical: 4 },
  disabled: { opacity: 0.5 },
  error: { color: '#dc2626' },
});
