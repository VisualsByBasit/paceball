import { useCallback, useState } from 'react';
import { useMicrophonePermission } from 'react-native-vision-camera';
import { updateSettings, useSettings } from '../settings';
import { soundOn } from './microphone';

/**
 * The one sound setting, shared by Capture's chip and the Settings switch so
 * the two can never disagree. On means the user wants sound and the system
 * allows the microphone. Turning it on asks for the microphone if it has not
 * been allowed; refused, it reads off and `denied` says so until the system
 * allows it.
 */
export function useSoundSetting() {
  const microphone = useMicrophonePermission();
  const { recordSound } = useSettings();
  const [refused, setRefused] = useState(false);
  const on = soundOn(microphone.status, recordSound);
  const { status } = microphone;

  const toggle = useCallback(async () => {
    if (on) {
      updateSettings({ recordSound: false });
      setRefused(false);
      return;
    }
    if (status === 'authorized') {
      updateSettings({ recordSound: true });
      setRefused(false);
      return;
    }
    // Asking counts as the offer being answered, so Capture never offers again.
    // The wish is kept even if the system refuses: allowing the microphone in
    // the system settings afterwards then turns sound on as it was asked for.
    updateSettings({ microphoneAsked: true, recordSound: true });
    const granted = await microphone.requestPermission().catch(() => false);
    setRefused(!granted);
  }, [on, status, microphone]);

  return {
    /** The system's own answer, for the first-visit offer. */
    microphone,
    on,
    /** Turning it on was refused. Cleared once the system allows it after all. */
    denied: refused && status !== 'authorized',
    toggle,
  };
}
