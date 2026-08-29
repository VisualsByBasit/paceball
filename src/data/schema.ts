import type { Session } from '../types';

export type SaveSessionInput = Omit<Session, 'id' | 'createdAt'>;

export type SessionFilter = {
  playerId?: string;
  from?: number;
  to?: number;
  limit?: number;
};

export const SESSION_INDEX_KEY = 'sessions:index';
export const sessionKey = (id: string) => `sessions:${id}`;
