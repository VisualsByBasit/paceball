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
  const fps = 59.94;
  const width = 1920;
  const height = 1080;
  const frameCount = 180;
  const calRealMetres = 20.12;
  const calA = { x: 100, y: 850, frame: 0 };
  const calB = { x: 1820, y: 850, frame: 0 };
  const calibrationPixels = Math.hypot(calB.x - calA.x, calB.y - calA.y);
  const pixelsPerMetre = calibrationPixels / calRealMetres;
  const travelMetres = 11;
  const release = { x: 400, y: 430, frame: 42 };
  const travelPixels = travelMetres * pixelsPerMetre;
  const trajectoryAngleRad = (20 * Math.PI) / 180;
  const frameDelta = Math.max(
    1,
    Math.round((travelMetres * fps * 3.6) / targetSpeedKmh),
  );
  const speedKmh =
    Math.round((travelMetres / (frameDelta / fps)) * 3.6 * 10) / 10;

  return {
    id,
    createdAt,
    playerId: mockPlayer.id,
    videoPath: `file:///mock/${id}.mp4`,
    framesDir: `file:///mock/${id}-frames`,
    fps,
    frameCount,
    width,
    height,
    exposureBias: -4,
    calibrationMethod: 'stumps',
    calA,
    calB,
    calRealMetres,
    pixelsPerMetre,
    release,
    bounce: {
      x: release.x + travelPixels * Math.cos(trajectoryAngleRad),
      y: release.y + travelPixels * Math.sin(trajectoryAngleRad),
      frame: release.frame + frameDelta,
    },
    travelMetres,
    speedKmh,
    errorKmh: 4,
    releaseSpeedKmh: Math.round(speedKmh * 1.06 * 10) / 10,
    releaseAngleDeg: 20,
  };
};

export const mockSessions: Session[] = [
  createMockSession('demo-3', 128.4, now),
  createMockSession('demo-2', 123.7, now - 2 * 24 * 60 * 60 * 1000),
  createMockSession('demo-1', 119.2, now - 5 * 24 * 60 * 60 * 1000),
];
