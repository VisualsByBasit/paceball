import { createMMKV } from 'react-native-mmkv';
import type { Diff, Player, Session, Trend } from '../types';
import { createMockSession, mockPlayer, mockSessions } from './mockData';
import {
  SESSION_INDEX_KEY,
  sessionKey,
  type SaveSessionInput,
  type SessionFilter,
} from './schema';

const storage = createMMKV({ id: 'paceball-data' });

const parseStoredValue = (key: string): unknown => {
  const value = storage.getString(key);

  if (value === undefined) {
    return undefined;
  }

  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`Stored Paceball data is invalid at key "${key}".`);
  }
};

const readSessionIndex = (): string[] => {
  const value = parseStoredValue(SESSION_INDEX_KEY);

  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value) || !value.every((id) => typeof id === 'string')) {
    throw new Error('Stored Paceball session index is invalid.');
  }

  return value;
};

const isSession = (value: unknown): value is Session => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const session = value as Record<string, unknown>;
  const nullableNumbers = ['releaseSpeedKmh', 'releaseAngleDeg'];
  const numbers = [
    'createdAt',
    'fps',
    'frameCount',
    'distanceM',
    'releaseFrame',
    'bounceFrame',
    'speedKmh',
    'errorKmh',
  ];

  return (
    typeof session.id === 'string' &&
    typeof session.playerId === 'string' &&
    typeof session.videoPath === 'string' &&
    typeof session.framesDir === 'string' &&
    numbers.every((field) => typeof session[field] === 'number') &&
    nullableNumbers.every(
      (field) => session[field] === null || typeof session[field] === 'number',
    )
  );
};

const readSession = (id: string): Session | undefined => {
  const value = parseStoredValue(sessionKey(id));

  if (value === undefined) {
    return undefined;
  }

  if (!isSession(value)) {
    throw new Error(`Stored Paceball session "${id}" is invalid.`);
  }

  return value;
};

const createId = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

export async function saveSession(record: SaveSessionInput): Promise<Session> {
  const session: Session = {
    ...record,
    id: createId('session'),
    createdAt: Date.now(),
  };

  const index = readSessionIndex();
  storage.set(sessionKey(session.id), JSON.stringify(session));
  storage.set(SESSION_INDEX_KEY, JSON.stringify([session.id, ...index]));

  return session;
}

export async function listSessions(
  filter: SessionFilter = {},
): Promise<Session[]> {
  let sessions = readSessionIndex()
    .map(readSession)
    .filter((session): session is Session => session !== undefined)
    .sort((a, b) => b.createdAt - a.createdAt);

  if (filter.playerId !== undefined) {
    sessions = sessions.filter((session) => session.playerId === filter.playerId);
  }
  if (filter.from !== undefined) {
    const from = filter.from;
    sessions = sessions.filter((session) => session.createdAt >= from);
  }
  if (filter.to !== undefined) {
    const to = filter.to;
    sessions = sessions.filter((session) => session.createdAt <= to);
  }
  if (filter.limit !== undefined) {
    const limit = Math.max(0, Math.floor(filter.limit));
    sessions = sessions.slice(0, limit);
  }

  return sessions;
}

export async function getTrend(
  playerId: string,
  range: 'week' | 'month' | 'all',
): Promise<Trend> {
  void playerId;
  void range;

  const points = [...mockSessions]
    .reverse()
    .map(({ createdAt: t, speedKmh }) => ({ t, speedKmh }));

  return {
    points,
    best: Math.max(...points.map(({ speedKmh }) => speedKmh)),
    avg:
      Math.round(
        (points.reduce((total, point) => total + point.speedKmh, 0) /
          points.length) *
          10,
      ) / 10,
    count: points.length,
  };
}

export async function getComparison(
  idA: string,
  idB: string,
): Promise<{ a: Session; b: Session; diffs: Diff[] }> {
  const a = createMockSession(idA, 119.2);
  const b = createMockSession(idB, 128.4);
  const diffs: Diff[] = [
    {
      label: 'Speed',
      a: a.speedKmh,
      b: b.speedKmh,
      delta: b.speedKmh - a.speedKmh,
      better: 'b',
    },
    {
      label: 'Distance',
      a: a.distanceM,
      b: b.distanceM,
      delta: b.distanceM - a.distanceM,
      better: 'equal',
    },
  ];

  return { a, b, diffs };
}

export async function renderExport(options: {
  sessionId: string;
  watermark: boolean;
}): Promise<{ imagePath: string; videoPath: string | null }> {
  const variant = options.watermark ? 'watermarked' : 'clean';

  return {
    imagePath: `file:///mock/${options.sessionId}-${variant}.png`,
    videoPath: null,
  };
}

export async function listPlayers(): Promise<Player[]> {
  return [{ ...mockPlayer }];
}

export async function createPlayer(name: string): Promise<Player> {
  return {
    id: createId('player'),
    name: name.trim() || 'New player',
    createdAt: Date.now(),
  };
}

export async function deleteSession(id: string): Promise<void> {
  const index = readSessionIndex();
  storage.remove(sessionKey(id));
  storage.set(
    SESSION_INDEX_KEY,
    JSON.stringify(index.filter((sessionId) => sessionId !== id)),
  );
}

export type { SaveSessionInput, SessionFilter } from './schema';
