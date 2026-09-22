/**
 * Sound is kept for the bat on ball, never for the measurement. Nothing here
 * reaches fps, frame extraction or dimensions, which read the video track only.
 */

/** Vision Camera's permission status, restated so this file stays free of native imports. */
export type MicrophoneStatus = 'not-determined' | 'authorized' | 'denied' | 'restricted';

/**
 * Whether the shutter offers the microphone before recording. Once ever, and
 * only while the system would still show its dialog. A denial is final here:
 * the user changes it in the system settings, not on the next capture.
 */
export function shouldOfferMicrophone(status: MicrophoneStatus, asked: boolean): boolean {
  return status === 'not-determined' && !asked;
}

/** Whether a recording carries a sound track. Without the microphone it is video only. */
export function recordsSound(status: MicrophoneStatus): boolean {
  return status === 'authorized';
}

export const MICROPHONE_OFFER_TITLE = 'Record sound too?';
export const MICROPHONE_OFFER_REASON = 'Allow the microphone to keep the sound of the delivery.';
export const MICROPHONE_OFFER_ALLOW = 'Allow microphone';
export const MICROPHONE_OFFER_SKIP = 'Video only';

/** The Settings note. Off is stated calmly: the measurement never needed sound. */
export function microphoneSettingLine(status: MicrophoneStatus, asked: boolean): string {
  if (status === 'authorized') return 'On. Recordings include the sound of the delivery.';
  if (status === 'not-determined' && !asked) {
    return 'Not asked yet. Paceball asks the first time you record.';
  }
  return 'Off. Recordings are video only, and speeds are measured the same way.';
}
