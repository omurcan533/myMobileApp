# Turkish / English localization

The app now has a minimal language store in `lib/i18n.ts`.

- Device language defaults to Turkish only when the device's language code is `tr`; otherwise English.
- The user can override this preference with `saveLanguage('tr' | 'en')`, which persists to AsyncStorage.
- React components can subscribe using `useLanguage()` and read translated strings using `t(key)`.
- Device language is detected via the JavaScript Intl API; no extra native dependency is needed.
- `initializeLanguage()` is integrated into app boot and a language selector is present in the profile UI.
- Home screen core controls are localized; remaining home text, other screens, game content, and server-originated messages still need translation.
- Keep game state and message codes language-neutral; localize on each player's device.
- Avoid treating literal translations of riddles and word puzzles as equivalent content.

The core home UI supports switching languages; full app localization is still in progress.
