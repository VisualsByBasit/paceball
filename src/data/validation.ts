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
  const markerSources = ['measured', 'paced-measured-shoe', 'paced-shoe-size'];
  // A guessed bounce yields no speed at all, and a speed only exists where one
  // was measured. Anything else stores a number that would read as measured.
  // markConfidence is absent on records saved before it was asked for.
  if (
    session.markConfidence !== undefined &&
    !['seen', 'uncertain', 'guessed'].includes(session.markConfidence as string)
  ) {
    return false;
  }
  if (session.markConfidence === 'guessed') {
    if (session.speedKmh !== null || session.errorKmh !== null) return false;
  } else if (
    !isPositiveNumber(session.speedKmh) ||
    !isFiniteNumber(session.errorKmh) ||
    (session.errorKmh as number) < 0
  ) {
    return false;
  }
  if ((session.uncertaintyModelVersion !== 1 && session.uncertaintyModelVersion !== 2) ||
      (session.markerSource !== undefined &&
        (session.calibrationMethod !== 'markers' || !markerSources.includes(session.markerSource as string))) ||
      (session.paceCount !== undefined &&
        (session.calibrationMethod !== 'markers' || session.markerSource === 'measured' ||
          !isPositiveNumber(session.paceCount)))) return false;
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
    (player.shoeSizeEu === undefined || isPositiveNumber(player.shoeSizeEu)) &&
    (player.shoeLengthCm === undefined || isPositiveNumber(player.shoeLengthCm))
  );
};
