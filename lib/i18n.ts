import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';
import { useSyncExternalStore } from 'react';

export type Language = 'tr' | 'en';
const KEY = 'appLanguage';
let language: Language = 'en';
const listeners = new Set<() => void>();
const dictionaries = {
  tr: { play: 'Oyna', how: 'Nasıl Oynanır', profile: 'Profil', newPlayer: 'Yeni Oyuncu', createRoom: 'Oda Oluştur', joinRoom: 'Odaya Katıl', publicRooms: 'Açık Odalar', language: 'Dil', gameArena: 'Çok oyunculu arena', teams: '2 Takım', heroDescription: 'İki takım, aynı bulmacalar. Parçaları kap, en absürt yaratığı inşa et!', nicknameRequired: 'Önce bir takma ad yaz', roomCodeRequired: 'Oda kodunu yaz.' },
  en: { play: 'Play', how: 'How to Play', profile: 'Profile', newPlayer: 'New Player', createRoom: 'Create Room', joinRoom: 'Join Room', publicRooms: 'Public Rooms', language: 'Language', gameArena: 'Multiplayer Arena', teams: '2 Teams', heroDescription: 'Two teams, the same puzzles. Win parts and build the wildest creature!', nicknameRequired: 'Enter a nickname first', roomCodeRequired: 'Enter a room code.' },
} as const;
export type TranslationKey = keyof typeof dictionaries.tr;
export function getLanguage() { return language; }
export function setLanguage(next: Language) {
  if (next === language) return;
  language = next;
  listeners.forEach((listener) => listener());
}
export async function initializeLanguage() {
  const saved = await AsyncStorage.getItem(KEY);
  const device = getLocales()[0]?.languageCode?.toLowerCase();
  setLanguage(saved === 'tr' || saved === 'en' ? saved : device === 'tr' ? 'tr' : 'en');
}
export async function saveLanguage(next: Language) {
  setLanguage(next);
  await AsyncStorage.setItem(KEY, next);
}
export function t(key: TranslationKey) { return dictionaries[language][key]; }
export function useLanguage() {
  return useSyncExternalStore((callback) => {
    listeners.add(callback);
    return () => { listeners.delete(callback); };
  }, getLanguage, () => 'en' as Language);
}
