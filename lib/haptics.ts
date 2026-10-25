import { Platform } from 'react-native';

const canVibrateOnWeb = () =>
  typeof navigator !== 'undefined' &&
  typeof navigator.vibrate === 'function' &&
  (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation?.hasBeenActive !== false;

/**
 * Universal Haptics Manager:
 * Hem Expo mobil cihazlarda (expo-haptics) hem de mobil web/tarayıcılarda (navigator.vibrate)
 * sorunsuz ve çökmeye dayanıklı çalışan dokunsal geri bildirim motoru.
 */
export const haptic = {
  light: async () => {
    try {
      if (Platform.OS === 'web' && canVibrateOnWeb()) {
        navigator.vibrate(12);
        return;
      }
      const Haptics = await import('expo-haptics').catch(() => null);
      if (Haptics) await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
  },

  medium: async () => {
    try {
      if (Platform.OS === 'web' && canVibrateOnWeb()) {
        navigator.vibrate(28);
        return;
      }
      const Haptics = await import('expo-haptics').catch(() => null);
      if (Haptics) await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}
  },

  heavy: async () => {
    try {
      if (Platform.OS === 'web' && canVibrateOnWeb()) {
        navigator.vibrate(50);
        return;
      }
      const Haptics = await import('expo-haptics').catch(() => null);
      if (Haptics) await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    } catch {}
  },

  success: async () => {
    try {
      if (Platform.OS === 'web' && canVibrateOnWeb()) {
        navigator.vibrate([15, 30, 20]);
        return;
      }
      const Haptics = await import('expo-haptics').catch(() => null);
      if (Haptics) await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {}
  },

  error: async () => {
    try {
      if (Platform.OS === 'web' && canVibrateOnWeb()) {
        navigator.vibrate([40, 40, 40]);
        return;
      }
      const Haptics = await import('expo-haptics').catch(() => null);
      if (Haptics) await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } catch {}
  },

  selection: async () => {
    try {
      if (Platform.OS === 'web' && canVibrateOnWeb()) {
        navigator.vibrate(8);
        return;
      }
      const Haptics = await import('expo-haptics').catch(() => null);
      if (Haptics) await Haptics.selectionAsync();
    } catch {}
  },
};
