import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createPlayer, getActivePlayer, listPlayers, listSessions, setActivePlayer, updatePlayer } from '../src/data';
import { SessionActions } from '../src/export/SessionActions';
import type { Player, Session } from '../src/types';
import { colors, opacity, radius, space, stroke, type } from '../src/ui/tokens';

const PAGE_SIZE = 25;

export default function PlayersScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [players, setPlayers] = useState<Player[]>([]);
  const [active, setActive] = useState<Player | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [more, setMore] = useState(false);
  const [name, setName] = useState('');
  const [height, setHeight] = useState('');
  const [profileName, setProfileName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const lock = useRef(false);
  const generation = useRef(0);

  const reload = useCallback(async () => {
    const token = ++generation.current;
    const [all, selected] = await Promise.all([listPlayers(), getActivePlayer()]);
    const rows = selected ? await listSessions({ playerId: selected.id, limit: PAGE_SIZE + 1 }) : [];
    if (token !== generation.current) return;
    setPlayers(all); setActive(selected); setSessions(rows.slice(0, PAGE_SIZE));
    setMore(rows.length > PAGE_SIZE); setExpanded(null);
    setHeight(selected?.heightCm?.toString() ?? '');
    setProfileName(selected?.name ?? '');
  }, []);

  const run = useCallback(async (action: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(null);
    try { await action(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load player data. Try again.'); }
    finally { lock.current = false; setBusy(false); }
  }, []);

  useFocusEffect(useCallback(() => {
    void run(reload);
    return () => { ++generation.current; };
  }, [reload, run]));

  const button = (label: string, action: () => void) => (
    <Pressable accessibilityRole="button" disabled={busy} onPress={action}
      style={[styles.button, busy && styles.disabled]}><Text style={styles.body}>{label}</Text></Pressable>
  );

  const loadMore = () => void run(async () => {
    if (!active || !more) return;
    const token = generation.current;
    const rows = await listSessions({ playerId: active.id, offset: sessions.length, limit: PAGE_SIZE + 1 });
    if (token !== generation.current) return;
    setSessions((old) => [...old, ...rows.slice(0, PAGE_SIZE)]);
    setMore(rows.length > PAGE_SIZE);
  });

  return <FlatList style={styles.screen}
    contentContainerStyle={{ padding: space.md, paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.lg }}
    data={sessions} keyExtractor={(s) => s.id} initialNumToRender={10}
    maxToRenderPerBatch={10} windowSize={5} keyboardShouldPersistTaps="handled"
    ListHeaderComponent={<View style={styles.header}>
      {button('Back', () => router.back())}
      <Text style={styles.title}>Players and deliveries</Text>
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
      <Text style={styles.title}>Saved deliveries</Text>
      {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
      {error ? button('Retry', () => void run(reload)) : null}
      {busy ? <ActivityIndicator color={colors.accent} /> : null}
    </View>}
    ListEmptyComponent={<Text style={styles.note}>{busy ? 'Loading…' : 'No saved deliveries for this player.'}</Text>}
    renderItem={({ item }) => <View style={styles.row}>
      <Text style={styles.reading}>{item.speedKmh.toFixed(1)} ± {item.errorKmh} km/h</Text>
      <Text style={styles.note}>Avg speed to bounce · {new Date(item.createdAt).toLocaleString()}</Text>
      {button(expanded === item.id ? 'Hide actions' : 'Export or delete', () => setExpanded(expanded === item.id ? null : item.id))}
      {expanded === item.id ? <SessionActions key={item.id} sessionId={item.id} onDeleted={() => void run(reload)} /> : null}
    </View>}
    ListFooterComponent={more ? button('Load more deliveries', loadMore) : null}
  />;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { gap: space.md, marginBottom: space.md },
  title: { ...type.h2, color: colors.text }, body: { ...type.body, color: colors.text },
  note: { ...type.caption, color: colors.muted }, error: { ...type.body, color: colors.danger },
  reading: { ...type.h2, ...type.mono, color: colors.text },
  button: { padding: space.md, borderRadius: radius.md, backgroundColor: colors.surface },
  input: { ...type.body, color: colors.text, padding: space.md, borderWidth: stroke.hairline, borderColor: colors.line, borderRadius: radius.md },
  row: { gap: space.sm, paddingVertical: space.md, borderBottomWidth: stroke.hairline, borderColor: colors.line },
  disabled: { opacity: opacity.disabled },
});
