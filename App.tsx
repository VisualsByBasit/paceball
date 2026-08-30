import { useEffect, useState, useRef } from 'react';
import { ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import { Camera, useCameraDevice, useCameraPermission, useVideoOutput } from 'react-native-vision-camera';
import FrameExtractor from './modules/frame-extractor/src/FrameExtractorModule';

export default function App() {
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back');
  const [ready, setReady] = useState(false);
  const cameraRef = useRef<any>(null);
  const [recording, setRecording] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const videoOutput = useVideoOutput({ fileType: 'mp4' });
  const recorderRef = useRef<any>(null);
  
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

    const start = async () => {
    try {
      setResult(null);
      const recorder = await videoOutput.createRecorder({});
      recorderRef.current = recorder;
      setRecording(true);
      await recorder.startRecording(
         async (path: string, reason: any) => {
          setRecording(false);
          try {
            const info = await FrameExtractor.getVideoInfo(path);
            setResult(
              `frames: ${info.frameCount}\n` +
              `duration: ${info.durationMs}ms\n` +
              `captureFps: ${info.captureFps}\n` +
              `derivedFps: ${info.derivedFps.toFixed(2)}\n` +
              `${info.width}x${info.height}`
            );
            console.log('INFO', info);
          } catch (e: any) {
            setResult(`extractor failed: ${e?.message ?? String(e)}`);
          }
        },
        (e: any) => {
          setRecording(false);
          setResult(`error: ${e?.message ?? String(e)}`);
        }
      );
    } catch (e: any) {
      setRecording(false);
      setResult(`start failed: ${e?.message ?? String(e)}`);
    }
  };

  const stop = async () => {
    try { await recorderRef.current?.stopRecording(); }
    catch (e: any) { setResult(`stop failed: ${e?.message ?? String(e)}`); }
  };

      return (
    <View style={{ flex: 1, backgroundColor: '#0A0B0D' }}>
        <Camera
        ref={cameraRef}
        style={{ flex: 1 }}
        device={device}
        isActive={true}
        outputs={[videoOutput]}
        constraints={[{ fps: 60 }, { videoStabilizationMode: 'off' }]}
        exposure={ready ? -4 : undefined}
        onStarted={() => setReady(true)}
      />

      <View style={{ padding: 24, paddingBottom: 40 }}>
        {result ? <Text style={styles.text}>{result}</Text> : null}
        <Pressable
          onPress={recording ? stop : start}
          style={[styles.btn, { backgroundColor: recording ? '#FF6B6B' : '#D4FF3F' }]}
        >
          <Text style={styles.btnText}>{recording ? 'Stop' : 'Record'}</Text>
        </Pressable>
      </View>
    </View>
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
