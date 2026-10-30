import React, { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { Avatar, Btn, Card, Eyebrow, Input, Muted, Screen, Text, Title } from './ui';
import { avatarFor, type AvatarId } from '../lib/art';
import { colors } from '../lib/theme';
import { useLanguage } from '../lib/i18n';

export const validNickname = (value: string) => {
  const length = Array.from(value.trim()).length;
  return length > 0 && length <= 20;
};

export function NicknameStep({ initialValue, avatarId, onContinue }: {
  initialValue: string; avatarId: AvatarId; onContinue: (name: string) => Promise<void>;
}) {
  const en = useLanguage() === 'en';
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const submitting = useRef(false);
  const submit = async () => {
    if (submitting.current) return;
    if (!validNickname(value)) {
      setError(en ? 'Enter a player name (1–20 characters).' : 'Lütfen 1–20 karakterlik bir oyuncu adı yaz.');
      return;
    }
    submitting.current = true;
    setSaving(true);
    setError('');
    try { await onContinue(value.trim()); }
    catch { setError(en ? 'Could not save your name. Please try again.' : 'İsmini kaydedemedik. Lütfen tekrar dene.'); }
    finally { submitting.current = false; setSaving(false); }
  };
  return <Screen>
    <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{flexGrow:1,justifyContent:'center',paddingVertical:20}}>
        <Card accent={colors.cyan} style={{gap:18,width:'100%',maxWidth:480,alignSelf:'center'}}>
          <View style={{alignItems:'center',gap:14}}>
            <Avatar source={avatarFor(value,avatarId)} size={80} ring={colors.cyan}/>
            <Eyebrow color={colors.cyan}>{en?'WELCOME TO THE WORKSHOP':'ATÖLYEYE HOŞ GELDİN'}</Eyebrow>
            <Title size={30}>{en?'What should we call you?':'Sana ne diyelim?'}</Title>
            <Muted style={{textAlign:'center'}}>{en?'Your friends will see this name in the room.':'Bu isim odadaki arkadaşlarına görünecek.'}</Muted>
          </View>
          <View style={{gap:8}}>
            <Text style={{color:colors.text,fontWeight:'700'}}>{en?'Your player name':'Oyuncu adın'}</Text>
            <Input autoFocus accessibilityLabel={en?'Your player name':'Oyuncu adın'} icon="person" value={value}
              onChangeText={next=>{setValue(next);setError('');}} placeholder={en?'e.g. Deniz':'Örn. Deniz'}
              maxLength={20} autoComplete="name" autoCapitalize="words" autoCorrect={false}
              returnKeyType="done" editable={!saving} onSubmitEditing={()=>void submit()} style={{fontSize:22,paddingVertical:18}}/>
            {!!error&&<Text accessibilityRole="alert" style={{color:colors.red}}>{error}</Text>}
          </View>
          <Btn title={en?'Continue':'Devam Et'} icon="arrow-forward" tone="success" loading={saving} onPress={()=>void submit()}/>
          <Muted style={{textAlign:'center',fontSize:12}}>{en?'We’ll remember it on this device. You can change it later.':'İsmini bu cihazda hatırlayacağız. Daha sonra değiştirebilirsin.'}</Muted>
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  </Screen>;
}
