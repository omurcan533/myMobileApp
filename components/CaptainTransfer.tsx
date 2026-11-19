import { useRef, useState } from 'react';
import { View } from 'react-native';
import { api } from '../lib/api';
import { format, translate } from '../lib/i18n';
import type { Ctx } from '../lib/types';
import { Btn, Muted, Sheet, Title, useToast } from './ui';

export function CaptainTransfer({ ctx }: { ctx: Ctx }) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const { toast, show } = useToast();
  const candidates = ctx.data.players.filter(player =>
    player.team_side === ctx.me.team_side && player.id !== ctx.me.id && !player.is_bot);
  const chosen = candidates.find(player => player.id === target);
  const transfer = async () => {
    if (!chosen || running.current) return;
    running.current = true;
    setBusy(true);
    try {
      await api.transferCaptain(ctx.data.room.id, chosen.id);
      setOpen(false);
      setTarget(null);
    } catch (error) {
      show((error as Error).message, 'error');
    } finally {
      running.current = false;
      setBusy(false);
    }
  };

  if (!ctx.me.is_captain || !['question', 'minigame', 'building', 'voting'].includes(ctx.data.room.phase)) return null;
  return <>
    <Btn title={translate("Kaptanlığı Devret")} size="sm" tone="ghost" icon="swap-horizontal"
      onPress={() => { setTarget(null); setOpen(true); }} />
    <Sheet visible={open} onClose={() => { if (!running.current) setOpen(false); }}>
      <Title size={22}>{translate("Kaptanlığı Devret")}</Title>
      {chosen ? <>
        <Muted>{format("Kaptanlığı {0} oyuncusuna devretmek istiyor musun?", chosen.nickname)}</Muted>
        <Btn title={translate("Devret")} loading={busy} disabled={busy} onPress={transfer} />
        <Btn title={translate("Vazgeç")} tone="ghost" disabled={busy} onPress={() => setTarget(null)} />
      </> : <View style={{ gap: 8 }}>
        {candidates.map(player => <Btn key={player.id} title={player.nickname} tone="ghost" onPress={() => setTarget(player.id)} />)}
        {!candidates.length && <Muted>{translate("Takımında kaptanlığı devredebileceğin oyuncu yok.")}</Muted>}
      </View>}
    </Sheet>
    {toast}
  </>;
}
