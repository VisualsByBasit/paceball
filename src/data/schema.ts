import type { Session } from '../types';

export type SaveSessionInput = Omit<Session, 'id' | 'createdAt'>;

export type SessionFilter = {
  playerId?: string;
  from?: number;
  to?: number;
  limit?: number;
};

export const SESSION_INDEX_KEY = 'sessions:index';
export const SESSION_KEY_PREFIX = 'sessions:';
export const sessionKey = (id: string) => `sessions:${id}`;

export const PLAYER_INDEX_KEY = 'players:index';
export const PLAYER_KEY_PREFIX = 'players:';
export const playerKey = (id: string) => `players:${id}`;
