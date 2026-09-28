/**
 * Select a supported exposure request, retaining the target where possible. The
 * target is the default from Settings; -4 is what capture has always asked for.
 */
export function captureExposure(device: {
  supportsExposureBias: boolean; minExposureBias: number; maxExposureBias: number;
} | undefined, target = -4): number | undefined {
  if (!device?.supportsExposureBias) return undefined;
  if (!Number.isFinite(device.minExposureBias) || !Number.isFinite(device.maxExposureBias) ||
    device.minExposureBias > device.maxExposureBias) return undefined;
  return Math.max(device.minExposureBias, Math.min(device.maxExposureBias, target));
}

type BiasRange = { minExposureBias: number; maxExposureBias: number };

/**
 * One press of the exposure control on Capture: a whole step darker or
 * brighter, across everything this camera reports, not just the Settings
 * defaults (which stop at 0). Held inside the camera's own range, so it never
 * asks for a value captureExposure would clamp back.
 */
export function stepExposure(current: number, direction: 1 | -1, device: BiasRange): number {
  const next = Math.round(current) + direction;
  return Math.max(device.minExposureBias, Math.min(device.maxExposureBias, next));
}

/** Whether a step each way would change anything on this camera. */
export function exposureSteps(current: number, device: BiasRange): { darker: boolean; brighter: boolean } {
  return {
    darker: stepExposure(current, -1, device) < current,
    brighter: stepExposure(current, 1, device) > current,
  };
}
