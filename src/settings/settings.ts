import { isCalibrationMethod } from '../physics/calibration';
import type { CalibrationMethod } from '../types';

/** How a speed is read out. Stored readings are always km/h; this is display only. */
export type SpeedUnit = 'kmh' | 'mph';

export type Settings = {
  /** The reference Mark opens on. Still changeable per delivery. */
  calibrationMethod: CalibrationMethod;
  unit: SpeedUnit;
  /**
   * The exposure bias Capture asks the camera for, before the device clamps it
   * to what it supports. Darker makes auto-exposure pick a shorter shutter, which
   * is what keeps a ball at pace from smearing across the frame.
   */
  exposureBias: number;
};

export const DEFAULT_SETTINGS: Settings = {
  calibrationMethod: 'stumps',
  unit: 'kmh',
  exposureBias: -4,
};

export const SPEED_UNITS: SpeedUnit[] = ['kmh', 'mph'];

/** Darkest first. -4 is the target capture has always used. */
export const EXPOSURE_BIAS_OPTIONS = [-4, -3, -2, -1, 0] as const;

function isSpeedUnit(value: unknown): value is SpeedUnit {
  return value === 'kmh' || value === 'mph';
}

function isExposureOption(value: unknown): value is number {
  return (EXPOSURE_BIAS_OPTIONS as readonly unknown[]).includes(value);
}

/**
 * Reads whatever was stored, field by field. A field that is missing or no longer
 * valid falls back to its default on its own, so one bad value never costs the
 * user the others.
 */
export function parseSettings(raw: unknown): Settings {
  const value = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  return {
    calibrationMethod:
      typeof value.calibrationMethod === 'string' && isCalibrationMethod(value.calibrationMethod)
        ? value.calibrationMethod
        : DEFAULT_SETTINGS.calibrationMethod,
    unit: isSpeedUnit(value.unit) ? value.unit : DEFAULT_SETTINGS.unit,
    exposureBias: isExposureOption(value.exposureBias)
      ? value.exposureBias
      : DEFAULT_SETTINGS.exposureBias,
  };
}
