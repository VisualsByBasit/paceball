import { useEffect, useState } from 'react';
import { createMMKV } from 'react-native-mmkv';
import { DEFAULT_SETTINGS, parseSettings, type Settings } from './settings';

export * from './settings';

/**
 * Preferences live in their own store, apart from saved deliveries, so nothing
 * here can reach a session record and a reset of one never touches the other.
 */
const storage = createMMKV({ id: 'paceball-settings' });
const KEY = 'settings';

const listeners = new Set<(settings: Settings) => void>();

export function getSettings(): Settings {
  const raw = storage.getString(KEY);
  if (raw === undefined) return DEFAULT_SETTINGS;
  try {
    return parseSettings(JSON.parse(raw));
  } catch {
    // Unreadable preferences are not worth failing a screen over. The defaults
    // are what a fresh install would have, and the next change rewrites the key.
    return DEFAULT_SETTINGS;
  }
}

export function updateSettings(patch: Partial<Settings>): Settings {
  const next = parseSettings({ ...getSettings(), ...patch });
  storage.set(KEY, JSON.stringify(next));
  for (const listener of listeners) listener(next);
  return next;
}

/** The current settings, kept live across screens as they change. */
export function useSettings(): Settings {
  const [settings, setSettings] = useState(getSettings);
  useEffect(() => {
    listeners.add(setSettings);
    // Anything written between the first render and subscribing.
    setSettings(getSettings());
    return () => {
      listeners.delete(setSettings);
    };
  }, []);
  return settings;
}
