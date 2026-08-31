import type { Player, Session } from '../types';

const now = Date.now();

export const mockPlayer: Player = {
  id: 'me',
  name: 'Demo Player',
  createdAt: now - 7 * 24 * 60 * 60 * 1000,
};

export const createMockSession = (
  id: string,
  targetSpeedKmh: number,
  createdAt = now,
): Session => {
  const fps = 60;
  const distanceM = 20.12;
  const releaseFrame = 42;
  const frameDelta = Math.max(
    1,
    Math.round((distanceM * fps * 3.6) / targetSpeedKmh),
  );
  const speedKmh =
    Math.round((distanceM / (frameDelta / fps)) * 3.6 * 10) / 10;

  return {
    id,
    createdAt,
    playerId: mockPlayer.id,
    videoPath: `file:///mock/${id}.mp4`,
    framesDir: `file:///mock/${id}-frames`,
    fps,
    frameCount: 180,
    distanceM,
    releaseFrame,
    bounceFrame: releaseFrame + frameDelta,
    speedKmh,
    errorKmh: 4,
    releaseSpeedKmh: Math.round(speedKmh * 1.06 * 10) / 10,
    releaseAngleDeg: 12,
  };
};

export const mockSessions: Session[] = [
  createMockSession('demo-3', 128.4, now),
  createMockSession('demo-2', 123.7, now - 2 * 24 * 60 * 60 * 1000),
  createMockSession('demo-1', 119.2, now - 5 * 24 * 60 * 60 * 1000),
];
