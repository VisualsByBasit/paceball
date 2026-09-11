import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createPlayer, getActivePlayer, listPlayers, setActivePlayer, updatePlayer } from '.';
import type { Player } from '../types';
import { colors, opacity, radius, space, stroke, type } from '../ui/tokens';

export default function PlayersScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [players, setPlayers] = useState<Player[]>([]);
  const [active, setActive] = useState<Player | null>(null);
  const [name, setName] = useState('');
  const [height, setHeight] = useState('');
  const [profileName, setProfileName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lock = useRef(false);
  const generation = useRef(0);
  const focused = useRef(false);

  const reload = useCallback(async () => {
    if (!focused.current) return;
    const token = ++generation.current;
    const [all, selected] = await Promise.all([listPlayers(), getActivePlayer()]);
    if (token !== generation.current) return;
    setPlayers(all); setActive(selected);
    setHeight(selected?.heightCm?.toString() ?? '');
    setProfileName(selected?.name ?? '');
  }, []);

  const run = useCallback(async (action: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(null);
    try { await action(); }
    catch (e) { if (focused.current) setError(e instanceof Error ? e.message : 'Could not load player data. Try again.'); }
    finally { lock.current = false; if (focused.current) setBusy(false); }
  }, []);

  useFocusEffect(useCallback(() => {
    focused.current = true;
    setBusy(lock.current);
    void reload().catch(() => { if (focused.current) setError('Could not load player data. Try again.'); });
    return () => { focused.current = false; ++generation.current; };
  }, [reload, run]));

  const button = (label: string, action: () => void) => (
    <Pressable accessibilityRole="button" disabled={busy} onPress={action}
      style={[styles.button, busy && styles.disabled]}><Text style={styles.body}>{label}</Text></Pressable>
  );

  return <ScrollView style={styles.screen}
    contentContainerStyle={{ padding: space.md, paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.lg }}
    keyboardShouldPersistTaps="handled">
    <View style={styles.header}>
      {button('Back', () => router.back())}
      <Text style={styles.title}>Players</Text>
      <Text style={styles.body}>{active ? `Bowling as ${active.name}` : 'No player selected.'}</Text>
      {__DEV__ ? <>
        <Text style={styles.note}>Multi-player development preview. Production access awaits Paceball Pro integration.</Text>
        {players.map((player) => <View key={player.id}>
          {button(`${player.id === active?.id ? 'Selected · ' : ''}${player.name}`,
            () => void run(async () => { await setActivePlayer(player.id); await reload(); }))}
        </View>)}
        <TextInput accessibilityLabel="New player name" placeholder="New player name" placeholderTextColor={colors.muted}
          value={name} onChangeText={setName} maxLength={80} editable={!busy} style={styles.input} />
        {button('Create and select player', () => void run(async () => {
          const player = await createPlayer(name); await setActivePlayer(player.id); setName(''); await reload();
        }))}
      </> : <Text style={styles.note}>Additional player profiles are planned for Paceball Pro.</Text>}
      {active ? <>
        <TextInput accessibilityLabel="Selected player name" value={profileName} onChangeText={setProfileName}
          maxLength={80} editable={!busy} style={styles.input} />
        <Text style={styles.note}>Your height in cm (optional, used for height calibration)</Text>
        <TextInput accessibilityLabel="Player height in centimetres" placeholder="Height in cm" placeholderTextColor={colors.muted}
          value={height} onChangeText={setHeight} keyboardType="decimal-pad" editable={!busy} style={styles.input} />
        {button('Save profile', () => void run(async () => {
          await updatePlayer(active.id, { name: profileName, heightCm: height.trim() ? Number(height) : null }); await reload();
        }))}
      </> : null}
      <Text style={styles.note}>History owns saved deliveries, trends and replay. This screen only manages profiles.</Text>
      {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
      {error ? button('Retry', () => void run(reload)) : null}
      {busy ? <ActivityIndicator color={colors.accent} /> : null}
    </View>
  </ScrollView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { gap: space.md, marginBottom: space.md },
  title: { ...type.h2, color: colors.text }, body: { ...type.body, color: colors.text },
  note: { ...type.caption, color: colors.muted }, error: { ...type.body, color: colors.danger },
  button: { padding: space.md, borderRadius: radius.md, backgroundColor: colors.surface },
  input: { ...type.body, color: colors.text, padding: space.md, borderWidth: stroke.hairline, borderColor: colors.line, borderRadius: radius.md },
  disabled: { opacity: opacity.disabled },
});
