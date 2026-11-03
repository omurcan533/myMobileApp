import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { translate } from './i18n';

export const ACCOUNT_DELETED_KEY = 'accountDeleted:v1';
export type DeletionResult = { localCleanupFailed: boolean };

async function invoke(action: 'delete' | 'issue_code') {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error(translate('Oturum bulunamadı. Uygulamayı yeniden açıp tekrar dene.'));
  const { data, error } = await supabase.functions.invoke('delete-account', {
    headers: { Authorization: `Bearer ${session.access_token}` },
    body: action === 'delete' ? { action, confirmation: 'DELETE' } : { action },
  });
  if (error || !data) throw new Error(translate('İşlem doğrulanamadı. Bağlantını kontrol edip tekrar dene veya destek adresine yaz.'));
  return data;
}
export async function issueDeletionCode(): Promise<string> {
  const data = await invoke('issue_code');
  if (typeof data.code !== 'string' || !/^[a-f0-9]{64}$/.test(data.code)) {
    throw new Error(translate('Silme kodu oluşturulamadı. Tekrar dene.'));
  }
  return data.code;
}
export async function deleteAccount(): Promise<DeletionResult> {
  const data = await invoke('delete');
  if (data.deleted !== true) throw new Error(translate('Hesap silme işlemi doğrulanamadı.'));
  let localCleanupFailed = false;
  // Never erase the caller's session/profile before the server confirms its transaction committed.
  try {
    await AsyncStorage.setItem(ACCOUNT_DELETED_KEY, 'true');
    const keys = await AsyncStorage.getAllKeys();
    await AsyncStorage.multiRemove(keys.filter(k =>
      ['roomId', 'nickname', 'avatarId', 'profile:v1', 'appLanguage', 'soundEnabled'].includes(k)
      || k.startsWith('party-auto:')));
  } catch { localCleanupFailed = true; }
  try {
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) localCleanupFailed = true;
  } catch { localCleanupFailed = true; }
  return { localCleanupFailed };
}
