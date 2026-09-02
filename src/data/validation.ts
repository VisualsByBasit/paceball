import type {
  CalibrationMethod,
  Player,
  Point,
  Session,
} from '../types';

const CALIBRATION_METHODS = new Set<CalibrationMethod>([
  'stumps',
  'ball',
  'height',
  'markers',
]);

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const isPositiveNumber = (value: unknown): value is number =>
  isFiniteNumber(value) && value > 0;

const isNullableNumber = (value: unknown) =>
  value === null || isFiniteNumber(value);

const isNullablePositiveNumber = (value: unknown) =>
  value === null || isPositiveNumber(value);

const isPoint = (
  value: unknown,
  width: number,
  height: number,
  frameCount: number,
): value is Point => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const point = value as Record<string, unknown>;
  return (
    isFiniteNumber(point.x) &&
    point.x >= 0 &&
    point.x < width &&
    isFiniteNumber(point.y) &&
    point.y >= 0 &&
    point.y < height &&
    Number.isInteger(point.frame) &&
    (point.frame as number) >= 0 &&
    (point.frame as number) < frameCount
  );
};

export const isSession = (value: unknown): value is Session => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const session = value as Record<string, unknown>;
  if (
    typeof session.id !== 'string' ||
    session.id.length === 0 ||
    typeof session.playerId !== 'string' ||
    session.playerId.length === 0 ||
    typeof session.videoPath !== 'string' ||
    session.videoPath.length === 0 ||
    typeof session.framesDir !== 'string' ||
    session.framesDir.length === 0 ||
    !isFiniteNumber(session.createdAt) ||
    !isPositiveNumber(session.fps) ||
    !Number.isInteger(session.frameCount) ||
    (session.frameCount as number) <= 0 ||
    !Number.isInteger(session.width) ||
    (session.width as number) <= 0 ||
    !Number.isInteger(session.height) ||
    (session.height as number) <= 0 ||
    !isFiniteNumber(session.exposureBias) ||
    !CALIBRATION_METHODS.has(session.calibrationMethod as CalibrationMethod) ||
    !isPositiveNumber(session.calRealMetres) ||
    !isPositiveNumber(session.pixelsPerMetre) ||
    !isPositiveNumber(session.travelMetres) ||
    !isPositiveNumber(session.speedKmh) ||
    !isFiniteNumber(session.errorKmh) ||
    session.errorKmh < 0 ||
    !isNullablePositiveNumber(session.releaseSpeedKmh) ||
    !isNullableNumber(session.releaseAngleDeg)
  ) {
    return false;
  }

  const width = session.width as number;
  const height = session.height as number;
  const frameCount = session.frameCount as number;
  if (
    !isPoint(session.calA, width, height, frameCount) ||
    !isPoint(session.calB, width, height, frameCount) ||
    !isPoint(session.release, width, height, frameCount) ||
    !isPoint(session.bounce, width, height, frameCount)
  ) {
    return false;
  }

  return session.bounce.frame > session.release.frame;
};

export const isPlayer = (value: unknown): value is Player => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const player = value as Record<string, unknown>;
  return (
    typeof player.id === 'string' &&
    player.id.length > 0 &&
    typeof player.name === 'string' &&
    player.name.trim().length > 0 &&
    isFiniteNumber(player.createdAt) &&
    (player.heightCm === undefined || isPositiveNumber(player.heightCm)) &&
    (player.shoeSizeEu === undefined || isPositiveNumber(player.shoeSizeEu))
  );
};
