import type { Player, Session } from '../types';

const now = Date.now();

export const mockPlayer: Player = {
  id: 'me',
  name: 'Mustafa',
  createdAt: now - 7 * 24 * 60 * 60 * 1000,
};

export const createMockSession = (
  id: string,
  speedKmh: number,
  createdAt = now,
): Session => ({
  id,
  createdAt,
  playerId: mockPlayer.id,
  videoPath: `file:///mock/${id}.mp4`,
  framesDir: `file:///mock/${id}-frames`,
  fps: 60,
  frameCount: 180,
  distanceM: 20.12,
  releaseFrame: 42,
  bounceFrame: 73,
  speedKmh,
  errorKmh: 4,
  releaseSpeedKmh: Math.round(speedKmh * 1.06 * 10) / 10,
  releaseAngleDeg: 12,
});

export const mockSessions: Session[] = [
  createMockSession('demo-3', 128.4, now),
  createMockSession('demo-2', 123.7, now - 2 * 24 * 60 * 60 * 1000),
  createMockSession('demo-1', 119.2, now - 5 * 24 * 60 * 60 * 1000),
];
