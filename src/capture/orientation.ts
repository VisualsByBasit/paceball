/** vision-camera's physical orientation, restated so this file stays free of native imports. */
export type DeviceOrientation = 'up' | 'right' | 'down' | 'left';

/**
 * How far to turn Capture's labels and controls so they read upright while the
 * screen itself stays portrait-locked, the way a camera app's do.
 *
 * 'right' means the phone's top edge now points right (turned clockwise), so
 * content turns back the other way, -90. Upside down is left as it is: nobody
 * films a delivery holding the phone that way, and flipping every label for a
 * moment's tilt reads as a fault.
 *
 * This only turns what is drawn over the preview. The recording, its rotation
 * metadata and everything Mark and Result read are untouched.
 */
export function uiRotation(orientation: DeviceOrientation | undefined): 0 | 90 | -90 {
  if (orientation === 'right') return -90;
  if (orientation === 'left') return 90;
  return 0;
}
