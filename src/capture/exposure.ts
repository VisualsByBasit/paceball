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
