import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

export type Language = 'tr' | 'en';
const KEY = 'appLanguage';
let language: Language = 'en';
const listeners = new Set<() => void>();
const dictionaries = {
  tr: { play: 'Oyna', how: 'Nasıl Oynanır', profile: 'Profil', newPlayer: 'Yeni Oyuncu', createRoom: 'Oda Oluştur', joinRoom: 'Odaya Katıl', publicRooms: 'Açık Odalar', language: 'Dil', gameArena: 'Çok oyunculu arena', teams: '2 Takım', heroDescription: 'İki takım, aynı bulmacalar. Parçaları kap, en absürt yaratığı inşa et!', nicknameRequired: 'Önce bir takma ad yaz', roomCodeRequired: 'Oda kodunu yaz.', roomTitle: 'Yeni Oda Kur', roomCreate: 'Oda Kur', roomJoin: 'Odaya Giriş Yap', nickname: 'Oyuncu adın', joinDescription: 'Arkadaşının paylaştığı kodu gir.', roomCode: 'ODA KODU', publicDescription: 'Herkese açık bekleyen ve devam eden oyunlar.', noRooms: 'Şimdilik açık oda yok', noRoomsHint: 'Bir oda kurduğunda burada görünecek.', roomsLoading: 'Açık odalar yükleniyor…', roomDescription: 'Hızlı, Standart ve Epik modlarda oyunlar rastgele seçilir. Özel modda oyunları sen belirlersin.', soundEffects: 'Ses efektleri', soundDescription: 'Oyun içi sesler ve geri bildirim' },
  en: { play: 'Play', how: 'How to Play', profile: 'Profile', newPlayer: 'New Player', createRoom: 'Create Room', joinRoom: 'Join Room', publicRooms: 'Public Rooms', language: 'Language', gameArena: 'Multiplayer Arena', teams: '2 Teams', heroDescription: 'Two teams, the same puzzles. Win parts and build the wildest creature!', nicknameRequired: 'Enter a nickname first', roomCodeRequired: 'Enter a room code.', roomTitle: 'Create a New Room', roomCreate: 'Create Room', roomJoin: 'Join Room', nickname: 'Your nickname', joinDescription: 'Enter the code shared by your friend.', roomCode: 'ROOM CODE', publicDescription: 'Public games waiting for players or in progress.', noRooms: 'No public rooms yet', noRoomsHint: 'Create a room to see it here.', roomsLoading: 'Loading public rooms…', roomDescription: 'Quick, Standard and Epic choose games randomly. Custom lets you choose.', soundEffects: 'Sound effects', soundDescription: 'In-game sounds and feedback' },
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
  const device = Intl.DateTimeFormat().resolvedOptions().locale.split(/[-_]/)[0]?.toLowerCase();
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

/** Localize existing game copy without changing server-side identifiers. */
const gameCopy: Record<string, string> = {
  "Takımlara ayrılın": "Split into teams",
  "Oda kodunu paylaş. Oyun başlayınca herkes adil şekilde iki takıma bölünür; her takımın bir Kaptanı olur.": "Share the room code. When the game starts, everyone is split into two teams and each team gets a captain.",
  "Soruları çöz, parça kazan": "Solve puzzles, win parts",
  "Harf bulmacası ya da bilmece… İlk doğru cevaplayan takım yapı parçasını alır. Yanlış cevap parçayı rakibe verir!": "Anagram or riddle… The first team to answer correctly wins a part. A wrong answer gives it to the rival team!",
  "Devre arası mini oyun": "Intermission minigame",
  "Refleks, hafıza veya denge oyununu kazanan takım bonus parça ve +2 puan alır.": "Win a reflex, memory or balance minigame to earn a bonus part and 2 points.",
  "Yaratığını inşa et": "Build your creature",
  "Takımın Mimarı toplanan parçaları tuvale dizer. Diğerleri emoji ve sesli yönlendirmeyle destek olur.": "Your team's architect arranges the collected parts. Teammates help with emojis and voice.",
  "Gizli oylama": "Secret voting",
  "En çılgın yaratığa gizlice oy ver. Resmi şampiyon puanla, en komik tasarım oylarla belirlenir.": "Vote secretly for the wildest creature. Points decide the champion; votes decide the funniest design.",
  "Yeni Oyuncu": "New Player",
  "Oyun rehberi": "Game guide",
  "Nasıl Oynanır?": "How to Play?",
  "5 adımda ucube yaratık inşa et, rakibi yen.": "Build a wild creature in five steps and beat your rivals.",
  "Hemen Oyna": "Play Now",
  "Oynanan": "Played",
  "Galibiyet": "Wins",
  "Kazanma": "Win Rate",
  "Hesap": "Account",
  "Avatarını değiştir": "Change your avatar",
  "Takma adın": "Your nickname",
  "Sonraki seviye": "Next level",
  "Seviye": "Level",
  "ADIM": "STEP",
  "Önce bir takma ad yaz": "Enter a nickname first",
  "Oda kodunu yaz.": "Enter a room code.",
  "Hızlı": "Quick",
  "Standart": "Standard",
  "Epik": "Epic",
  "Özel": "Custom",
  "Oyunları sen seç": "Choose your games",
  "Yana kaydırarak modları keşfet": "Swipe to explore modes",
  "Bekliyor": "Waiting",
  "Devam ediyor": "In progress",
  "Katıl": "Join",
  "Oda dolu": "Room full",
  "Oyun başladı": "Game started",
  "oyuncu": "players",
  "mod": "mode",
  "Oyuncu profili": "Player profile",
  "Avatarını seç": "Choose your avatar",
  "Oyun odasında arkadaşların seçtiğin avatarı görecek.": "Your friends will see your chosen avatar in the game room.",
  "Devam Et": "Continue",
  "Bağlanamadık": "Connection failed",
  "Tekrar dene": "Try again",
  "Arena hazırlanıyor…": "Preparing the arena…",
  "Odaya bağlanılıyor…": "Connecting to room…",
  "Takımlar belirleniyor…": "Assigning teams…",
  "Odadan Çıkarıldın": "Removed from room",
  "Oda kurucusu seni bekleme odasından çıkardı.": "The host removed you from the waiting room.",
  "Gizli oylama evresi": "Secret voting phase",
  "En Çılgın Tasarım?": "Wildest Design?",
  "Kalan Oy Süresi": "Voting time left",
  "Gizli oy! İstediğin yaratığa oy verebilirsin; ister kendi takımına, ister rakibe.": "Secret vote! Vote for any creature, whether it belongs to your team or your rivals.",
  "Oyun gizlice kaydedildi": "Your vote was recorded",
  "Canlı inşa evresi": "Live building phase",
  "İnşa Zamanı": "Time to Build",
  "Mimar:": "Architect:",
  " (Sen)": " (You)",
  "Hazır mısın?": "Are you ready?",
  "İlk soru birazdan geliyor…": "The first question is coming soon…"
};
export function translate(source: string): string {
  return language === 'tr' ? source : gameCopy[source] ?? source;
}
