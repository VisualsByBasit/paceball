import type { Diff, Player, Session, Trend } from '../types';
import { createMockSession, mockPlayer, mockSessions } from './mockData';
import type { SaveSessionInput, SessionFilter } from './schema';

const createId = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

export async function saveSession(record: SaveSessionInput): Promise<Session> {
  return {
    ...record,
    id: createId('session'),
    createdAt: Date.now(),
  };
}

export async function listSessions(
  filter: SessionFilter = {},
): Promise<Session[]> {
  let sessions = [...mockSessions];

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
  void id;
}

export type { SaveSessionInput, SessionFilter } from './schema';
