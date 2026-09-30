import type { RecordingProfile } from '../capture/bitrate';
import { isRecordLength, type RecordLength } from '../capture/recordLength';
import { isSelfTimer, type SelfTimer } from '../capture/selfTimer';
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
  /**
   * When the first ever analysis was saved, as epoch milliseconds. The free
   * allowance runs in seven-day periods from here, so this is written once and
   * never moved. Null until the first analysis is saved.
   */
  analysisAnchor: number | null;
  /**
   * What the camera actually produced last time: the recorded frame size and the
   * frame rate read from that file, and the bitrate it writes on its own default.
   * Only used to set a Pro recording's bitrate target above this phone's default,
   * never to assume anything about a clip being marked.
   */
  lastRecording: RecordingProfile | null;
  /**
   * Whether the paywall has been offered once during onboarding. Set the moment
   * it is shown, whether the user then buys or skips, and never cleared, so it
   * is offered at most once per install.
   */
  onboardingPaywallShown: boolean;
  /**
   * Whether Capture has offered the microphone once. Android reports a single
   * denial as still askable, so the system status alone would ask again on
   * every recording. Set when the offer is answered either way, never cleared.
   */
  microphoneAsked: boolean;
  /**
   * The delivery each player chose for Home's hero, by player id. Absent means
   * the personal best. Only a choice: a delivery that is deleted or no longer
   * counts falls back to the best wherever this is read.
   */
  featuredDelivery: Record<string, string>;
  /** The start delay last chosen on Capture, in seconds. 0 is off. */
  selfTimer: SelfTimer;
  /**
   * Whether recordings carry sound, from Capture's chip and the Settings
   * switch alike. Only a wish: without the microphone allowed the clip is
   * video only whatever this says. On by default, so a phone that allows the
   * microphone records sound as it always has.
   */
  recordSound: boolean;
  /** How long Capture records, in seconds. 0 records until stopped. */
  recordLength: RecordLength;
  /** Whether the logo intro on a cold start plays its sound. Muted when off. */
  introSound: boolean;
};

export const DEFAULT_SETTINGS: Settings = {
  calibrationMethod: 'stumps',
  unit: 'kmh',
  exposureBias: -4,
  analysisAnchor: null,
  lastRecording: null,
  onboardingPaywallShown: false,
  microphoneAsked: false,
  featuredDelivery: {},
  selfTimer: 0,
  recordSound: true,
  recordLength: 0,
  introSound: true,
};

export const SPEED_UNITS: SpeedUnit[] = ['kmh', 'mph'];

/** Darkest first. -4 is the target capture has always used. */
export const EXPOSURE_BIAS_OPTIONS = [-4, -3, -2, -1, 0] as const;

function isSpeedUnit(value: unknown): value is SpeedUnit {
  return value === 'kmh' || value === 'mph';
}

const positive = (n: unknown): n is number =>
  typeof n === 'number' && Number.isFinite(n) && n > 0;

/**
 * A profile saved before the default bitrate was measured has none, and reads
 * as unmeasured: the next recording then runs at the default and measures it.
 */
function parseRecordingProfile(value: unknown): RecordingProfile | null {
  if (typeof value !== 'object' || value === null) return null;
  const { width, height, fps, defaultBitRate } = value as Record<string, unknown>;
  if (!positive(width) || !positive(height) || !positive(fps)) return null;
  return { width, height, fps, defaultBitRate: positive(defaultBitRate) ? defaultBitRate : null };
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
    analysisAnchor:
      typeof value.analysisAnchor === 'number' && Number.isFinite(value.analysisAnchor)
        ? value.analysisAnchor
        : DEFAULT_SETTINGS.analysisAnchor,
    lastRecording: parseRecordingProfile(value.lastRecording) ?? DEFAULT_SETTINGS.lastRecording,
    onboardingPaywallShown: value.onboardingPaywallShown === true,
    microphoneAsked: value.microphoneAsked === true,
    featuredDelivery: parseFeatured(value.featuredDelivery),
    selfTimer: isSelfTimer(value.selfTimer) ? value.selfTimer : DEFAULT_SETTINGS.selfTimer,
    recordSound: value.recordSound !== false,
    recordLength: isRecordLength(value.recordLength)
      ? value.recordLength
      : DEFAULT_SETTINGS.recordLength,
    introSound: value.introSound !== false,
  };
}

/** Player id to delivery id, keeping only string pairs. */
function parseFeatured(value: unknown): Record<string, string> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [player, delivery] of Object.entries(value as Record<string, unknown>)) {
    if (player && typeof delivery === 'string' && delivery) out[player] = delivery;
  }
  return out;
}

/**
 * The settings patch that shows `deliveryId` on a player's Home hero, or,
 * given null, goes back to the personal best.
 */
export function featuring(
  current: Record<string, string>,
  playerId: string,
  deliveryId: string | null
): { featuredDelivery: Record<string, string> } {
  const next = { ...current };
  if (deliveryId === null) delete next[playerId];
  else next[playerId] = deliveryId;
  return { featuredDelivery: next };
}
