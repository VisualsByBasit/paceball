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

/** Shown after a recording that fell back to video only. The saved setting is untouched. */
export const SOUND_FALLBACK_NOTICE = 'Recorded without sound. The microphone was in use.';

/**
 * Whether a recording failure could have come from the sound track. Vision
 * Camera hands back CameraX's code without the cause, and an audio encoder that
 * cannot start (the microphone held by a call or a voice note) arrives as
 * ERROR_ENCODING_FAILED. A missing permission names the microphone itself.
 * Storage, output options, too-short clips and an inactive session are never
 * sound's fault, so they are not retried.
 */
export function isAudioFailure(message: string): boolean {
  return /audio|microphone|RECORD_AUDIO|ERROR_ENCODING_FAILED/i.test(message);
}

export type FailureOutcome =
  | { kind: 'retry-without-sound'; original: string }
  | { kind: 'report'; error: string };

/**
 * What a failed recording leads to. Only a recording with sound, failing on
 * its sound, is retried, and only once: a retry that fails too reports the
 * error the first attempt failed on, as a failure without sound always did.
 */
export function afterRecordingFailure(
  error: string,
  { withAudio, retrying }: { withAudio: boolean; retrying: string | null }
): FailureOutcome {
  if (retrying !== null) return { kind: 'report', error: retrying };
  if (withAudio && isAudioFailure(error)) return { kind: 'retry-without-sound', original: error };
  return { kind: 'report', error };
}
