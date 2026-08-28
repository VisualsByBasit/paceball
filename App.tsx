import { useEffect } from 'react';
import { ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import { useCameraDevice, useCameraPermission } from 'react-native-vision-camera';

export default function App() {
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back');

  useEffect(() => {
    if (!hasPermission) requestPermission();
  }, [hasPermission]);

  if (!hasPermission) {
    return (
      <View style={styles.center}>
        <Text style={styles.text}>Camera permission needed</Text>
        <Pressable onPress={requestPermission} style={styles.btn}>
          <Text style={styles.btnText}>Grant</Text>
        </Pressable>
      </View>
    );
  }

  if (!device) {
    return (
      <View style={styles.center}>
        <Text style={styles.text}>No camera device found</Text>
      </View>
    );
  }

  const d = device as any;
  const ranges = d.supportedFPSRanges ?? [];

  const check = (n: number) => {
    try { return d.supportsFPS(n) ? 'YES' : 'no'; }
    catch (e) { return 'error'; }
  };

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Text style={styles.h1}>Camera</Text>
      <Text style={styles.sub}>{String(d.name)} · id {String(d.id)}</Text>

      <Text style={styles.h2}>Fixed FPS support</Text>
      {[30, 60, 90, 120, 240].map(n => (
        <View key={n} style={styles.row}>
          <Text style={styles.rowText}>{n} fps</Text>
          <Text style={check(n) === 'YES' ? styles.fps : styles.warn}>{check(n)}</Text>
        </View>
      ))}

      <Text style={styles.h2}>Supported FPS ranges ({ranges.length})</Text>
      {ranges.map((r: any, i: number) => (
        <View key={i} style={styles.row}>
          <Text style={styles.rowText}>Range {i + 1}</Text>
          <Text style={styles.fps}>{r.minFps ?? r.min} – {r.maxFps ?? r.max} fps</Text>
        </View>
      ))}
    </ScrollView>
  );
}
 
const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#0A0B0D' },
  content: { padding: 24, paddingTop: 60 },
  center: { flex: 1, backgroundColor: '#0A0B0D', alignItems: 'center', justifyContent: 'center' },
  h1: { color: '#fff', fontSize: 28, fontWeight: '800' },
  h2: { color: '#D4FF3F', fontSize: 12, fontWeight: '800', letterSpacing: 1.5, marginTop: 28, marginBottom: 12 },
  sub: { color: '#8A9099', fontSize: 14, marginTop: 4 },
  stat: { color: '#fff', fontSize: 16, marginTop: 12 },
  warn: { color: '#FF6B6B', fontSize: 16 },
  text: { color: '#fff', fontSize: 16 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#1F232A' },
  rowText: { color: '#fff', fontSize: 14 },
  fps: { color: '#D4FF3F', fontSize: 14, fontWeight: '700' },
  btn: { backgroundColor: '#D4FF3F', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12, marginTop: 16 },
  btnText: { color: '#0A0B0D', fontWeight: '700' },
  mono: { color: '#8A9099', fontSize: 11, fontFamily: 'monospace' },
});
