import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

// A light tap on the phone (#249): when the user sends a message and when the
// coach replies. Only inside the installed app; on the website it does
// nothing, so the pilot and study pages behave exactly as before.
export function lightTap(): void {
  if (!Capacitor.isNativePlatform()) return;
  // Fire and forget: a phone without a vibration motor, or a user who turned
  // system haptics off, must never break sending a message.
  Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
}
