/**
 * Which lens the delivery is recorded on.
 *
 * The scale is never assumed from the lens. Every reading is calibrated against
 * a known distance marked in the recorded frames themselves, and the frames
 * carry their own dimensions, so a wider lens changes the view and the marks
 * move with it. Nothing downstream stores a pixels-per-metre that belongs to a
 * particular camera.
 */
export type Lens = 'wide' | 'ultra-wide';

/** The shape this module reads off a vision-camera device. */
export type LensDevice = {
  id: string;
  position: string;
  type: string;
};

export const LENS_LABEL: Record<Lens, string> = {
  wide: '1x',
  'ultra-wide': '0.6x',
};

/**
 * The back ultra-wide camera, when the phone really has one as a camera of its
 * own. Never inferred: useCameraDevice's filter returns the closest match rather
 * than nothing, so asking it for an ultra-wide on a phone without one hands back
 * the ordinary lens. Only an exact type on the back counts.
 */
export function ultraWideDevice<T extends LensDevice>(devices: readonly T[]): T | undefined {
  return devices.find((d) => d.position === 'back' && d.type === 'ultra-wide-angle');
}

/** Whether the ultra-wide option should be offered at all. */
export function hasUltraWide(devices: readonly LensDevice[]): boolean {
  return ultraWideDevice(devices) !== undefined;
}

/**
 * The device to record on. Falls back to the default back camera whenever the
 * ultra-wide is asked for but not present, so a missing lens cannot leave the
 * screen with no camera.
 */
export function deviceForLens<T extends LensDevice>(
  lens: Lens,
  devices: readonly T[],
  fallback: T | undefined
): T | undefined {
  if (lens !== 'ultra-wide') return fallback;
  return ultraWideDevice(devices) ?? fallback;
}
