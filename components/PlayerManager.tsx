import React, { useRef, useState } from 'react';
import { View } from 'react-native';
import { Avatar, Btn, Card, Muted, Sheet, Text, Title, useToast } from './ui';
import { api, GameError } from '../lib/api';
import { avatarFor } from '../lib/art';
import { colors, teamColor } from '../lib/theme';
import { useLanguage } from '../lib/i18n';
import { canManagePlayers, removalClosesRoom } from '../lib/playerManagement';
import type { Ctx, Player } from '../lib/types';

export function PlayerManager({ ctx }: { ctx: Ctx }) {
  if (!ctx.me.is_host || !canManagePlayers(ctx.data)) return null;
  // Unmount the panel when play starts so old confirmations never reopen later.
  return <PlayerManagerPanel ctx={ctx} />;
}

function PlayerManagerPanel({ ctx }: { ctx: Ctx }) {
  const en = useLanguage() === 'en';
  const loc = (tr: string, english: string) => en ? english : tr;
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<{ player: Player; confirmClose: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const { toast, show } = useToast();
  const close = () => { if (!running.current) { setOpen(false); setTarget(null); } };
  const remove = async () => {
    if (!target || running.current) return;
    running.current = true; setBusy(true);
    try {
      const result = await api.removeRoomPlayer(ctx.data.room.id, target.player.id, target.confirmClose);
      setTarget(null);
      if (result.room_closed) { setOpen(false); ctx.onLeave(); }
      else show(loc('Oyuncu odadan çıkarıldı.', 'Player removed from the room.'), 'success');
    } catch (error) {
      if (error instanceof GameError && error.code === 'team_would_be_empty') {
        // The roster may have changed since opening the sheet. Never retry a
        // room-closing operation without showing the stronger confirmation.
        setTarget({ ...target, confirmClose: true });
      } else show((error as Error).message, 'error');
    } finally { running.current = false; setBusy(false); }
  };
  return <>
    <Btn title={`${loc('Oyuncuları Yönet', 'Manage Players')} (${ctx.data.players.length})`} icon="people" tone="ghost" size="sm" onPress={() => setOpen(true)} />
    <Sheet visible={open} onClose={close} centered={!!target}>
      {target ? <>
        <Title size={22}>{target.confirmClose ? loc('Takım oyuncusuz kalacak', 'This team will have no players') : loc('Oyuncuyu çıkar?', 'Remove player?')}</Title>
        <Muted>{target.confirmClose
          ? loc(`${target.player.nickname} takımındaki son oyuncu. Onu çıkarırsan oda kapanacak ve herkes ana ekrana dönecek. Devam etmek istiyor musun?`, `${target.player.nickname} is their team's last player. Removing them will close the room and return everyone to Home. Continue?`)
          : loc(`${target.player.nickname} odadan çıkarılacak. Oyun kalan oyuncularla devam edecek.`, `${target.player.nickname} will be removed. The game will continue with the remaining players.`)}</Muted>
        <Btn title={loc('Vazgeç', 'Cancel')} tone="ghost" disabled={busy} onPress={() => setTarget(null)} />
        <Btn title={target.confirmClose ? loc('Çıkar ve Odayı Kapat', 'Remove and Close Room') : loc('Odadan Çıkar', 'Remove Player')} tone="danger" loading={busy} onPress={() => void remove()} />
      </> : <>
        <Title size={22}>{loc('Odadaki Oyuncular', 'Players in Room')}</Title>
        <Muted>{loc('Oyuncu çıkarma yalnızca oyun aralarında yapılabilir. Kaptan veya mimar çıkarılırsa görevi takım arkadaşına geçer.', 'Players can only be removed between games. Captain and architect roles pass to a teammate when necessary.')}</Muted>
        {ctx.data.players.map(player => <Card key={player.id} accent={teamColor(player.team_side)} style={{gap:8}}>
          <View style={{flexDirection:'row',alignItems:'center',gap:10}}>
            <Avatar source={avatarFor(player.nickname,player.avatar_id)} size={40} ring={teamColor(player.team_side)} />
            <View style={{flex:1,gap:3}}><Text style={{color:colors.text,fontWeight:'800'}}>{player.nickname}</Text>
              <Muted>{player.team_side ? loc(`Takım ${player.team_side}`, `Team ${player.team_side}`) : loc('Takım bekleniyor', 'Awaiting team')}{player.is_host ? loc(' · Kurucu', ' · Host') : ''}{player.is_captain ? loc(' · Kaptan', ' · Captain') : ''}{player.is_architect ? loc(' · Mimar', ' · Architect') : ''}</Muted>
            </View>
          </View>
          {!player.is_host && player.id !== ctx.me.id && !player.is_bot && <Btn title={loc('Çıkar', 'Remove')} tone="danger" size="sm" onPress={() => setTarget({player,confirmClose:removalClosesRoom(ctx.data,player)})} />}
        </Card>)}
        <Btn title={loc('Oyuna Dön', 'Back to Game')} tone="ghost" onPress={close}/>
      </>}
    </Sheet>
    {toast}
  </>;
}
