/** Select a supported exposure request, retaining the -4 target where possible. */
export function captureExposure(device: {
  supportsExposureBias: boolean; minExposureBias: number; maxExposureBias: number;
} | undefined): number | undefined {
  if (!device?.supportsExposureBias) return undefined;
  if (!Number.isFinite(device.minExposureBias) || !Number.isFinite(device.maxExposureBias) ||
    device.minExposureBias > device.maxExposureBias) return undefined;
  return Math.max(device.minExposureBias, Math.min(device.maxExposureBias, -4));
}
