import { createMMKV } from 'react-native-mmkv';
import type { Diff, Player, Session, Trend } from '../types';
import { deleteSessionFiles, stageSessionFiles } from './files';
import { compareSessions } from './comparison';
import {
  PLAYER_INDEX_KEY,
  ACTIVE_PLAYER_KEY,
  PLAYER_KEY_PREFIX,
  playerKey,
  SESSION_INDEX_KEY,
  SESSION_KEY_PREFIX,
  sessionKey,
  type SaveSessionInput,
  type SessionFilter,
} from './schema';
import { isPlayer, isSession } from './validation';

const storage = createMMKV({ id: 'paceball-data' });
const DAY_MS = 24 * 60 * 60 * 1000;

// Compare the stored bytes on every read: external writes/corruption and module
// restarts remain observable. Only parsing and validation are cached, not truth.
const sessionCache = new Map<string, { raw: string; session: Session }>();
const MAX_CACHED_SESSIONS = 1024;
const copySession = (s: Session): Session => ({
  ...s, calA: { ...s.calA }, calB: { ...s.calB },
  release: { ...s.release }, bounce: { ...s.bounce },
});

const warnAboutStoredData = (message: string, error?: unknown) => {
  console.warn(`[Paceball storage] ${message}`, error);
};

const parseStoredValue = (key: string): unknown => {
  const value = storage.getString(key);

  if (value === undefined) {
    return undefined;
  }

  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error(`Stored Paceball data is invalid at key "${key}".`, {
      cause: error,
    });
  }
};

const readSession = (id: string): Session | undefined => {
  const raw = storage.getString(sessionKey(id));
  if (raw === undefined) {
    sessionCache.delete(id);
    return undefined;
  }
  const cached = sessionCache.get(id);
  if (cached?.raw === raw) return copySession(cached.session);
  sessionCache.delete(id);
  let value: unknown;
  try { value = JSON.parse(raw); }
  catch (cause) { throw new Error(`Stored Paceball session "${id}" is invalid.`, { cause }); }
  if (!isSession(value) || value.id !== id) {
    throw new Error(`Stored Paceball session "${id}" is invalid.`);
  }

  if (sessionCache.size >= MAX_CACHED_SESSIONS) {
    sessionCache.delete(sessionCache.keys().next().value!);
  }
  sessionCache.set(id, { raw, session: value });
  return copySession(value);
};

const readPlayer = (id: string): Player | undefined => {
  const value = parseStoredValue(playerKey(id));

  if (value === undefined) {
    return undefined;
  }

  if (!isPlayer(value) || value.id !== id) {
    throw new Error(`Stored Paceball player "${id}" is invalid.`);
  }

  return value;
};

const writeIndex = (key: string, ids: string[]) => {
  storage.set(key, JSON.stringify(ids));
};

const rebuildIndex = <T extends { id: string; createdAt: number }>(
  indexKey: string,
  recordPrefix: string,
  readRecord: (id: string) => T | undefined,
): string[] => {
  const records: T[] = [];

  for (const key of storage.getAllKeys()) {
    if (key === indexKey || !key.startsWith(recordPrefix)) {
      continue;
    }

    const id = key.slice(recordPrefix.length);
    try {
      const record = readRecord(id);
      if (record !== undefined) {
        records.push(record);
      }
    } catch (error) {
      warnAboutStoredData(`Skipping corrupt record at "${key}".`, error);
    }
  }

  const ids = records
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(({ id }) => id);
  writeIndex(indexKey, ids);
  return ids;
};

const readIndex = (indexKey: string, rebuild: () => string[]): string[] => {
  try {
    const value = parseStoredValue(indexKey);

    if (value === undefined) {
      return [];
    }

    if (!Array.isArray(value) || !value.every((id) => typeof id === 'string')) {
      throw new Error(`Stored Paceball index "${indexKey}" is invalid.`);
    }

    const uniqueIds = [...new Set(value)];
    if (uniqueIds.length !== value.length) {
      writeIndex(indexKey, uniqueIds);
    }
    return uniqueIds;
  } catch (error) {
    warnAboutStoredData(`Rebuilding corrupt index "${indexKey}".`, error);
    return rebuild();
  }
};

const rebuildSessionIndex = () =>
  rebuildIndex(SESSION_INDEX_KEY, SESSION_KEY_PREFIX, readSession);

const readSessionIndex = () =>
  readIndex(SESSION_INDEX_KEY, rebuildSessionIndex);

const rebuildPlayerIndex = () =>
  rebuildIndex(PLAYER_INDEX_KEY, PLAYER_KEY_PREFIX, readPlayer);

const readPlayerIndex = () => readIndex(PLAYER_INDEX_KEY, rebuildPlayerIndex);

const recoverUnindexedRecords = <T>(
  indexKey: string,
  recordPrefix: string,
  indexedIds: Set<string>,
  readRecord: (id: string) => T | undefined,
): T[] => {
  const recovered: T[] = [];

  for (const key of storage.getAllKeys()) {
    if (key === indexKey || !key.startsWith(recordPrefix)) {
      continue;
    }

    const id = key.slice(recordPrefix.length);
    if (indexedIds.has(id)) {
      continue;
    }

    try {
      const record = readRecord(id);
      if (record !== undefined) {
        recovered.push(record);
      }
    } catch (error) {
      warnAboutStoredData(`Skipping corrupt orphan at "${key}".`, error);
    }
  }

  return recovered;
};

const indexMatches = (expected: string[], actual: string[]) =>
  expected.length === actual.length &&
  expected.every((id, index) => id === actual[index]);

const createId = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

export async function saveSession(record: SaveSessionInput): Promise<Session> {
  const id = createId('session');
  const createdAt = Date.now();
  const candidate: Session = { ...record, id, createdAt };
  if (!isSession(candidate)) {
    throw new Error('Cannot save an invalid Paceball session.');
  }

  const stagedFiles = await stageSessionFiles(
    id,
    record.videoPath,
    record.framesDir,
  );
  const session: Session = {
    ...record,
    id,
    createdAt,
    videoPath: stagedFiles.videoPath,
    framesDir: stagedFiles.framesDir,
  };

  let index: string[] | undefined;
  try {
    // File copying awaits native work. Read the index afterwards so concurrent
    // saves cannot overwrite a delivery committed while this copy was running.
    index = readSessionIndex();
    storage.set(sessionKey(session.id), JSON.stringify(session));
    writeIndex(SESSION_INDEX_KEY, [session.id, ...index]);
  } catch (error) {
    try {
      storage.remove(sessionKey(session.id));
      if (index !== undefined) writeIndex(SESSION_INDEX_KEY, index);
    } catch (recoveryError) {
      warnAboutStoredData('Could not roll back MMKV after a failed save.', recoveryError);
    }
    try {
      stagedFiles.rollback();
    } catch (recoveryError) {
      warnAboutStoredData('Could not roll back files after a failed save.', recoveryError);
    }
    throw new Error(`Could not save session "${session.id}".`, { cause: error });
  }

  stagedFiles.finalize();
  return session;
}

export async function listSessions(
  filter: SessionFilter = {},
): Promise<Session[]> {
  for (const key of ['limit', 'offset'] as const) {
    const value = filter[key];
    if (value !== undefined && (!Number.isInteger(value) || value < 0)) {
      throw new Error(`${key} must be a non-negative integer.`);
    }
  }
  for (const key of ['from', 'to'] as const) {
    if (filter[key] !== undefined && !Number.isFinite(filter[key])) {
      throw new Error(`${key} must be a finite timestamp.`);
    }
  }
  const index = readSessionIndex();
  const sessions: Session[] = [];
  const validIds: string[] = [];

  for (const id of index) {
    try {
      const session = readSession(id);
      if (session !== undefined) {
        sessions.push(session);
        validIds.push(id);
      }
    } catch (error) {
      warnAboutStoredData(`Skipping corrupt session "${id}".`, error);
    }
  }

  const recovered = recoverUnindexedRecords(
    SESSION_INDEX_KEY,
    SESSION_KEY_PREFIX,
    new Set(index),
    readSession,
  );
  sessions.push(...recovered);
  validIds.push(...recovered.map(({ id }) => id));

  if (!indexMatches(index, validIds)) {
    writeIndex(SESSION_INDEX_KEY, validIds);
  }

  let filteredSessions = sessions.sort((a, b) =>
    b.createdAt - a.createdAt || a.id.localeCompare(b.id));
  if (filter.playerId !== undefined) {
    filteredSessions = filteredSessions.filter(
      (session) => session.playerId === filter.playerId,
    );
  }
  if (filter.from !== undefined) {
    const from = filter.from;
    filteredSessions = filteredSessions.filter(
      (session) => session.createdAt >= from,
    );
  }
  if (filter.to !== undefined) {
    const to = filter.to;
    filteredSessions = filteredSessions.filter(
      (session) => session.createdAt <= to,
    );
  }
  const start = filter.offset ?? 0;
  return filteredSessions.slice(start,
    filter.limit === undefined ? undefined : start + filter.limit);
}

export async function getTrend(
  playerId: string,
  range: 'week' | 'month' | 'all',
): Promise<Trend> {
  const days = range === 'week' ? 7 : range === 'month' ? 30 : undefined;
  const sessions = await listSessions({
    playerId,
    from: days === undefined ? undefined : Date.now() - days * DAY_MS,
  });
  const points = sessions
    .sort((a, b) => a.createdAt - b.createdAt)
    .map(({ createdAt: t, speedKmh }) => ({ t, speedKmh }));

  if (points.length === 0) {
    return { points: [], best: 0, avg: 0, count: 0 };
  }

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
  const a = requireSession(idA);
  const b = requireSession(idB);
  return { a, b, diffs: compareSessions(a, b) };
}

function requireSession(id: string): Session {
  const session = readSession(id);
  if (!session) throw new Error(`Saved delivery "${id}" was not found.`);
  return session;
}

export async function renderExport(options: {
  sessionId: string;
  watermark: boolean;
}): Promise<{ imagePath: string; videoPath: string | null }> {
  const session = requireSession(options.sessionId);
  // Keep native rendering out of startup and data-only consumers.
  const { renderSessionImage } = await import('../export/renderSessionImage');
  return renderSessionImage(session, options.watermark);
}

export async function listPlayers(): Promise<Player[]> {
  const index = readPlayerIndex();
  const players: Player[] = [];
  const validIds: string[] = [];

  for (const id of index) {
    try {
      const player = readPlayer(id);
      if (player !== undefined) {
        players.push(player);
        validIds.push(id);
      }
    } catch (error) {
      warnAboutStoredData(`Skipping corrupt player "${id}".`, error);
    }
  }

  const recovered = recoverUnindexedRecords(
    PLAYER_INDEX_KEY,
    PLAYER_KEY_PREFIX,
    new Set(index),
    readPlayer,
  );
  players.push(...recovered);
  validIds.push(...recovered.map(({ id }) => id));

  if (!indexMatches(index, validIds)) {
    writeIndex(PLAYER_INDEX_KEY, validIds);
  }

  return players.sort((a, b) => a.createdAt - b.createdAt);
}

type PlayerDetails = { heightCm?: number | null; shoeSizeEu?: number | null };

function playerValues(name: string, details: PlayerDetails): Pick<Player, 'name' | 'heightCm' | 'shoeSizeEu'> {
  const trimmedName = name.trim();
  if (!trimmedName || trimmedName.length > 80) {
    throw new Error('Player name cannot be empty or longer than 80 characters.');
  }
  for (const [label, value, min, max] of [
    ['Height', details.heightCm, 50, 250],
    ['Shoe size', details.shoeSizeEu, 15, 60],
  ] as const) {
    if (value != null && (!Number.isFinite(value) || value < min || value > max)) {
      throw new Error(`${label} must be between ${min} and ${max}.`);
    }
  }
  return { name: trimmedName,
    ...(details.heightCm == null ? {} : { heightCm: details.heightCm }),
    ...(details.shoeSizeEu == null ? {} : { shoeSizeEu: details.shoeSizeEu }) };
}

export async function createPlayer(name: string, details: PlayerDetails = {}): Promise<Player> {
  const values = playerValues(name, details);

  const player: Player = {
    id: createId('player'),
    ...values,
    createdAt: Date.now(),
  };
  const index = readPlayerIndex();
  storage.set(playerKey(player.id), JSON.stringify(player));
  try {
    writeIndex(PLAYER_INDEX_KEY, [...index, player.id]);
  } catch (error) {
    storage.remove(playerKey(player.id));
    throw error;
  }
  return player;
}

export async function updatePlayer(id: string, changes: { name?: string } & PlayerDetails): Promise<Player> {
  const current = readPlayer(id);
  if (!current) throw new Error('Player was not found.');
  const player: Player = { id: current.id, createdAt: current.createdAt, ...playerValues(changes.name ?? current.name, {
    heightCm: changes.heightCm === undefined ? current.heightCm : changes.heightCm,
    shoeSizeEu: changes.shoeSizeEu === undefined ? current.shoeSizeEu : changes.shoeSizeEu,
  }) };
  storage.set(playerKey(id), JSON.stringify(player));
  return player;
}

export async function setActivePlayer(id: string): Promise<Player> {
  const player = readPlayer(id);
  if (!player) throw new Error('Select an existing player.');
  storage.set(ACTIVE_PLAYER_KEY, id);
  return player;
}

export async function getActivePlayer(): Promise<Player | null> {
  const id = storage.getString(ACTIVE_PLAYER_KEY);
  if (id) {
    try {
      const player = readPlayer(id);
      if (player) return player;
    } catch (error) { warnAboutStoredData('Active player needs recovery.', error); }
  }
  // Existing single-player installs keep the same oldest profile, with no
  // session migration. Corrupt/deleted selections recover to a valid profile.
  const fallback = (await listPlayers())[0] ?? null;
  if (fallback) storage.set(ACTIVE_PLAYER_KEY, fallback.id);
  else storage.remove(ACTIVE_PLAYER_KEY);
  return fallback;
}

export async function getPlayer(id: string): Promise<Player | null> {
  return readPlayer(id) ?? null;
}

export async function listActivePlayerSessions(filter: Omit<SessionFilter, 'playerId'> = {}): Promise<Session[]> {
  const player = await getActivePlayer();
  return player ? listSessions({ ...filter, playerId: player.id }) : [];
}

export async function deleteSession(id: string): Promise<void> {
  const session = readSession(id);
  const index = readSessionIndex();

  if (session !== undefined) {
    deleteSessionFiles(session.videoPath, session.framesDir);
  }

  storage.remove(sessionKey(id));
  writeIndex(
    SESSION_INDEX_KEY,
    index.filter((sessionId) => sessionId !== id),
  );
}

export type { SaveSessionInput, SessionFilter } from './schema';
