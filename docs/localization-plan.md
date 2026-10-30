# Turkish / English localization

The app now has a minimal language store in `lib/i18n.ts`.

- Device language defaults to Turkish only when the device's language code is `tr`; otherwise English.
- The user can override this preference with `saveLanguage('tr' | 'en')`, which persists to AsyncStorage.
- React components can subscribe using `useLanguage()` and read translated strings using `t(key)`.
- Add `expo-localization` with `npx expo install expo-localization` before importing the module in the app.
- Integrate `initializeLanguage()` into application boot and add a language selector to the profile/settings UI.
- Replace hardcoded strings screen-by-screen, including game content and server-originated messages.
- Keep game state and message codes language-neutral; localize on each player's device.
- Avoid treating literal translations of riddles and word puzzles as equivalent content.

This is a foundation only; the UI is not yet fully localized.
