/** vision-camera's physical orientation, restated so this file stays free of native imports. */
export type DeviceOrientation = 'up' | 'right' | 'down' | 'left';

/**
 * How far to turn Capture's labels and controls so they read upright while the
 * screen itself stays portrait-locked, the way a camera app's do.
 *
 * vision-camera names the orientation the way the picture reads, not the way
 * the phone was turned: 'right' comes back when the phone is turned
 * anticlockwise, its top edge pointing left and the ground along the screen's
 * left edge. Content turns clockwise to meet it, +90, which puts the bottom of
 * whatever is drawn, the guide's baseline included, on the ground side. 'left'
 * is the mirror of that. Checked on the phone in both directions: the first
 * version had these the other way round and every label read upside down.
 *
 * Upside down is left as it is: nobody films a delivery holding the phone that
 * way, and flipping every label for a moment's tilt reads as a fault.
 *
 * This only turns what is drawn over the preview. The recording, its rotation
 * metadata and everything Mark and Result read are untouched.
 */
export function uiRotation(orientation: DeviceOrientation | undefined): 0 | 90 | -90 {
  if (orientation === 'right') return 90;
  if (orientation === 'left') return -90;
  return 0;
}
