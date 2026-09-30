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

/**
 * Whether the Sound chip, and the Settings switch beside it, read on: the
 * user wants sound and the system allows the microphone. Either one off and
 * the clip is video only, measured exactly the same way.
 */
export function soundOn(status: MicrophoneStatus, wanted: boolean): boolean {
  return wanted && recordsSound(status);
}

/** Said under the Sound chip when turning it on was refused by the system. */
export const MICROPHONE_DENIED_LINE =
  'Microphone permission is off. Turn it on in Settings to record sound.';
export const MICROPHONE_DENIED_LINK = 'Open settings';

export const MICROPHONE_OFFER_TITLE = 'Record sound too?';
export const MICROPHONE_OFFER_REASON =
  'Sound is optional. Measurement works without it. Replays and exports start muted.';
export const MICROPHONE_OFFER_ALLOW = 'Allow microphone';
export const MICROPHONE_OFFER_SKIP = 'Continue without sound';

/** The Settings note under the Sound switch. Off is stated calmly: the measurement never needed sound. */
export function microphoneSettingLine(status: MicrophoneStatus, wanted: boolean): string {
  if (soundOn(status, wanted)) {
    return 'On. Recordings include the sound of the delivery, kept on this phone.';
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

/** Said when a recording fails after it had started. Nothing from it is kept. */
export const RECORD_AGAIN =
  'The recording failed partway through, so it was not kept. Record the delivery again.';

/** Added when that failure could have been the sound track's. */
export const RECORD_AGAIN_WITHOUT_SOUND =
  `${RECORD_AGAIN} The next recording is video only, in case the microphone was the cause.`;

export type FailureOutcome =
  | { kind: 'retry-without-sound'; original: string }
  | { kind: 'report'; error: string }
  /**
   * The recording had already started. Its partial file is discarded, nothing
   * is retried, and the user is asked to record the delivery again.
   * `dropSound` turns the microphone off for the next recording.
   */
  | { kind: 'record-again'; error: string; dropSound: boolean };

/**
 * What a failed recording leads to.
 *
 * Before the recording's start event nothing has been filmed, so a recording
 * with sound that failed on its sound is retried once without it. A retry that
 * fails too reports the error the first attempt failed on.
 *
 * After the start event the delivery was being filmed, and by the time the
 * failure arrives it is over. Retrying then would film the empty pitch
 * afterwards and hand that on as the delivery, so nothing is ever retried: the
 * partial clip is thrown away and the user is told to record again.
 */
export function afterRecordingFailure(
  error: string,
  { withAudio, retrying, started }: { withAudio: boolean; retrying: string | null; started: boolean }
): FailureOutcome {
  if (started) {
    const dropSound = withAudio && isAudioFailure(error);
    return {
      kind: 'record-again',
      error: dropSound ? RECORD_AGAIN_WITHOUT_SOUND : RECORD_AGAIN,
      dropSound,
    };
  }
  if (retrying !== null) return { kind: 'report', error: retrying };
  if (withAudio && isAudioFailure(error)) return { kind: 'retry-without-sound', original: error };
  return { kind: 'report', error };
}
