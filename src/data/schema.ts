import type { Session } from '../types';

// Existing AB capture/result callers still produce timing-only readings.
export type SaveSessionInput = Omit<Session, 'id' | 'createdAt' | 'uncertaintyModelVersion'> & {
  uncertaintyModelVersion?: Session['uncertaintyModelVersion'];
};

export type SessionFilter = {
  playerId?: string;
  from?: number;
  to?: number;
  limit?: number;
  offset?: number;
};

export const ACTIVE_PLAYER_KEY = 'preferences:active-player';

export const SESSION_INDEX_KEY = 'sessions:index';
export const SESSION_KEY_PREFIX = 'sessions:';
export const sessionKey = (id: string) => `sessions:${id}`;

export const PLAYER_INDEX_KEY = 'players:index';
export const PLAYER_KEY_PREFIX = 'players:';
export const playerKey = (id: string) => `players:${id}`;
