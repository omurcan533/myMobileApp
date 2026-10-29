import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import {PlayHeader,PlayArea} from '../components/PlayHeader';
import { Scoreboard } from '../components/Scoreboard';
import {NextShortcut,useNextShortcut} from '../components/NextShortcut';
import {
  Btn, Card, Chip, CoinPill, Eyebrow, IconName, Input, Muted, Pulse, Screen, Sheet, Tap, Title, Text, useToast,
} from '../components/ui';
import { useNow } from '../hooks/useNow';
import { api } from '../lib/api';
import { currentRound, effNow, secondsLeft, totalQuestionsForRoom } from '../lib/selectors';
import { alpha, colors, gradients, teamColor, teamName, tierLabel } from '../lib/theme';
import { soundFx } from '../lib/soundEffects';
import { haptic } from '../lib/haptics';
import type { Ctx, Tier } from '../lib/types';

const TIER_COLOR: Record<Tier, string> = { base: colors.cyan, body: colors.violet, roof: colors.magenta };

export function QuestionScreen({ ctx }: { ctx: Ctx }) {
  const { data, me, catalog } = ctx;
  const { room } = data;
  const now = effNow(room, useNow());
  const round = useMemo(() => currentRound(data.rounds), [data.rounds]);
  const shortcut=useNextShortcut(me.is_host&&round?.status==='resolved',round?.id);
  const advancing=useRef<string|null>(null);
  const totalQuestions = useMemo(() => totalQuestionsForRoom(room.mode, data.rounds.length), [room.mode, data.rounds.length]);
  const [areaHeight,setAreaHeight]=useState(500);
  const [suggestionsOpen,setSuggestionsOpen]=useState(false);
  const [text, setText] = useState('');
  const [final, setFinal] = useState('');
  const [confirmAnswer, setConfirmAnswer] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { toast, show } = useToast();

  useEffect(() => {
    setText('');
    setFinal('');
    setConfirmAnswer(null);
  }, [round?.id]);

  const myTeam = data.teams.find((t) => t.side === me.team_side);
  const prize = round ? catalog[round.piece_id] : undefined;
  const tColor = teamColor(me.team_side);

  if (!round) {
    return (
      <Screen>
        <Scoreboard ctx={ctx} />
        <View style={s.center}>
          <View style={s.bigIcon}><Ionicons name="film" size={40} color={colors.cyan} /></View>
          <Title size={26}>Hazır mısın?</Title>
          <Muted>İlk soru birazdan geliyor…</Muted>
        </View>
      </Screen>
    );
  }

  const isOpen = round.status === 'open';
  const isPreparing = isOpen && !round.opens_at;
  if (isPreparing) {
    const roundColor = TIER_COLOR[round.tier];
    const instructions = round.kind === 'anagram'
      ? 'Karışık harfleri çöz ve cevabı en hızlı şekilde yaz. İlk doğru cevap takımına parça kazandırır.'
      : round.kind === 'social'
        ? 'Oyunculardan birini seçip takımına öner. Kaptan, takımın adına nihai cevabı gönderir.'
        : 'Tahminini önce takımına öner. Kaptan doğru cevabı gönderir; yanlış cevap parçayı rakibe verir.';
    const briefingReadyAt = (room.phase_started_at ? Date.parse(room.phase_started_at) : 0) + 5000;
    const canContinue = now >= briefingReadyAt;
    const waitSeconds = Math.max(0, Math.ceil((briefingReadyAt - now) / 1000));

    const toggleBriefingPause = async () => {
      setBusy(true);
      try {
        await api.togglePause(room.id);
      } catch (error) {
        show((error as Error).message, 'error');
      } finally {
        setBusy(false);
      }
    };
    const startQuestion = async () => {
      if (!me.is_host || room.paused || busy || !canContinue) return;
      setBusy(true);
      try {
        await api.confirmBriefing(room.id);
      } catch (error) {
        show((error as Error).message, 'error');
      } finally {
        setBusy(false);
      }
    };

    return (
      <Screen>
        <ScrollView style={{flex:1,minHeight:0}} contentContainerStyle={{flexGrow:1,paddingBottom:16}} keyboardShouldPersistTaps="handled">
        <Scoreboard ctx={ctx} />
        <View style={s.briefingWrap}>
          <Card accent={roundColor} style={s.briefingCard}>
            <Eyebrow live color={roundColor} dot={roundColor}>Soru Başlangıcı</Eyebrow>
            <Title size={26} style={{ textAlign: 'center' }}>Hazır Olun</Title>
            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
              <Chip
                icon="help-circle"
                label={`Soru ${round.idx + 1} / ${totalQuestions}`}
                color={colors.cyan}
              />
              <Chip
                icon={round.kind === 'anagram' ? 'shuffle' : round.kind === 'social' ? 'people' : 'extension-puzzle'}
                label={round.kind === 'anagram' ? 'Harfleri Düzenle' : round.kind === 'social' ? 'Grup Oylaması' : 'Bilmeceyi Çöz'}
                color={roundColor}
              />
            </View>
            {prize && (
              <View style={{ alignItems: 'center', gap: 2, marginVertical: 4 }}>
                <Text style={{ fontSize: 36 }}>{prize.emoji}</Text>
                <Text style={{ color: roundColor, fontSize: 13, fontWeight: '700' }}>Ödül: {prize.name_tr}</Text>
              </View>
            )}
            <Muted style={{ textAlign: 'center', lineHeight: 20 }}>{instructions}</Muted>
            {me.is_host ? (
              <Btn
                title={canContinue ? 'Devam Et' : `Devam Et · ${waitSeconds} sn`}
                icon={canContinue ? 'play' : 'hourglass'}
                tone={canContinue ? 'success' : 'ghost'}
                size="lg"
                loading={busy}
                disabled={!canContinue || room.paused}
                onPress={startQuestion}
                style={{ alignSelf: 'stretch', marginTop: 6 }}
              />
            ) : (
              <View style={{ alignItems: 'center', gap: 8, marginTop: 6 }}>
                <ActivityIndicator size="small" color={roundColor} />
                <Muted style={{ textAlign: 'center' }}>Kurucunun devam etmesi bekleniyor… Devam edilince süre başlayacak.</Muted>
              </View>
            )}
          </Card>
        </View>
        </ScrollView>
        {room.paused && (
          <View style={s.paused}>
            <View style={s.bigIcon}><Ionicons name="pause" size={40} color={colors.cyan} /></View>
            <Title size={26}>Oyun Duraklatıldı</Title>
            <Muted>Kaptanlar dilediğinde devam ettirebilir.</Muted>
            {me.is_captain && (
              <Btn title="Devam Et" icon="play" tone="success" disabled={busy} onPress={toggleBriefingPause} style={{ marginTop: 16, alignSelf: 'stretch' }} />
            )}
          </View>
        )}
        {toast}
      </Screen>
    );
  }

  const left = secondsLeft(round.closes_at, now);
  const total = round.opens_at && round.closes_at ? (Date.parse(round.closes_at) - Date.parse(round.opens_at)) / 1000 : 1;
  const lockedLeft = me.locked_until ? Math.max(0, (Date.parse(me.locked_until) - now) / 1000) : 0;
  const suggestions = data.answers.filter((a) => a.round_id === round.id && a.side === me.team_side && !a.is_final);
  const showHint = isOpen && round.hints.length > 0 && left < total / 2;
  const tierColor = TIER_COLOR[round.tier as Tier];
  const continueAt = round.resolved_at ? Date.parse(round.resolved_at) + 3000 : 0;
  const continueReady = !isOpen && !!round.resolved_at && now >= continueAt;
  const continueWait = Math.max(0, Math.ceil((continueAt - now) / 1000));

  // ---- Harf kredisi: cevap maskesi + satın alınan harfler ----
  const credits = myTeam?.credits ?? 0;
  const myReveals = data.reveals.filter((r) => r.round_id === round.id && r.side === me.team_side);
  const maskChars = round.answer_mask ? Array.from(round.answer_mask) : [];
  const slots = maskChars.map((ch, i) => {
    if (ch !== '_') return { ch, known: true, bought: false, sep: !/[a-z0-9çğıöşüâîû]/i.test(ch) };
    const r = myReveals.find((x) => x.pos === i + 1);
    return { ch: r ? r.letter : '', known: !!r, bought: !!r, sep: false };
  });
  const hiddenLeft = slots.filter((x) => !x.known && !x.sep).length;
  const canBuy = isOpen && !room.paused && credits > 0 && hiddenLeft > 1;

  const buyLetter = () =>
    run(async () => {
      await api.buyLetter(round.id);
      soundFx.pop();
      haptic.light();
    });

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); } catch (e) { show((e as Error).message, 'error'); } finally { setBusy(false); }
  };

  const submit = () => {
    const body = text.trim();
    if (!body) return;
    run(async () => {
      const r = await api.submitAnswer(round.id, body);
      setText('');
      if (r.correct === false) {
        soundFx.wrong();
        haptic.error();
        show('Yanlış! 3 saniye bekle.', 'error');
      } else if (r.suggested) {
        soundFx.click();
        haptic.light();
        show('Öneri takımına iletildi', 'success');
      } else if (r.correct === true) {
        soundFx.correct();
        haptic.success();
      }
    });
  };

  const sendFinal = (body: string) => {
    const b = body.trim();
    if (!b) return;
    setConfirmAnswer(b);
  };

  const joker = () =>
    run(async () => {
      await api.playJoker(room.id);
      soundFx.cheer();
      haptic.success();
      show('Joker kullanıldı! Soru çözüldü ve parça kazanıldı.', 'success');
    });
  const pause = () => run(async () => { await api.togglePause(room.id); });
  const continueGame = () => {
    if(!me.is_host||!continueReady||busy||room.paused||advancing.current===round.id)return;
    advancing.current=round.id;
    return run(async()=>{try{const result=await api.advanceHost(room.id);if(!result.advanced)advancing.current=null}catch(error){advancing.current=null;throw error}});
  };

  const iWon = round.winner_side === me.team_side;
  const resultColor = round.winner_side ? (iWon ? colors.mint : colors.red) : colors.muted;
  const resultIcon: IconName = round.winner_side ? (iWon ? 'trophy' : 'sad') : 'alarm';
  const roundAnswers = data.answers
    .filter((answer) => answer.round_id === round.id)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));

  return (
    <Screen key={round.id+String(isOpen)} active={isOpen}>
      {isOpen&&<PlayHeader ctx={ctx} left={left} label={`Soru ${round.idx+1}/${totalQuestions}`} instructions="Cevabını yazıp gönder. Bilmece ve grup sorularında takımın nihai cevabını kaptan gönderir. Takım kartlarına dokunarak puan, parça ve kredi detaylarını görebilirsin." onPause={pause} onJoker={myTeam&&(myTeam.jokers_left??0)>0?joker:undefined} busy={busy}/>}
      <KeyboardAvoidingView onLayout={e=>setAreaHeight(e.nativeEvent.layout.height)} style={{ flex: 1,minHeight:0 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
       <PlayArea active={isOpen} viewportRef={shortcut.viewportRef} onLayout={shortcut.measure}>
        <ScrollView key={round.id+':'+String(isOpen)} onScroll={shortcut.measure} onContentSizeChange={shortcut.measure} scrollEventThrottle={16} style={{flex:1,minHeight:0}} contentContainerStyle={[s.scroll,isOpen&&{gap:8,paddingTop:0,paddingBottom:8}]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {!isOpen&&<Scoreboard ctx={ctx} />}

          {/* ================= ROZET & TUR BİLGİSİ ================= */}
          {!isOpen&&<View style={s.metaRow}>
            <View style={s.metaLeft}>
              <Chip color={tColor} icon="shield" label={teamName(me.team_side)} />
              {me.is_captain && <Chip color={colors.gold} icon="ribbon" label="Kaptan" />}
              {me.is_architect && <Chip color={colors.magenta} icon="construct" label="Mimar" />}
            </View>
            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
              <Chip color={colors.cyan} icon="help-circle" label={`Soru ${round.idx + 1} / ${totalQuestions}`} />
              <Chip color={tierColor} label={tierLabel[round.tier as Tier]} />
            </View>
          </View>}

          {/* ================= SORU KARTI ================= */}
          <Card accent={tierColor} style={[s.questionCard,isOpen&&{padding:10,gap:8}]}>
            {!isOpen&&<View style={s.questionHeader}>
              <Chip
                color={tierColor}
                icon={round.kind === 'anagram' ? 'shuffle' : round.kind === 'social' ? 'people' : 'extension-puzzle'}
                label={round.kind === 'anagram' ? 'Harfleri Düzenle' : round.kind === 'social' ? 'Grup Oylaması' : 'Bilmeceyi Çöz'}
              />
              {prize && (
                <View style={s.prizeTag}>
                  <Text style={s.prizeEmoji}>{prize.emoji}</Text>
                  <Text style={s.prizeName}>{prize.name_tr}</Text>
                </View>
              )}
            </View>}

            <ScrollView nestedScrollEnabled style={{maxHeight:isOpen?Math.max(70,Math.min(180,areaHeight-300)):undefined,alignSelf:'stretch'}} contentContainerStyle={{alignItems:'center'}} keyboardShouldPersistTaps="handled">
            {round.kind === 'anagram' ? (
              <View style={s.tiles}>
                {Array.from(round.prompt.toLocaleUpperCase('tr-TR')).map((ch, i) =>
                  ch === ' ' ? (
                    <View key={i} style={{ width: 14 }} />
                  ) : (
                    <LinearGradient key={i} colors={gradients.gold} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.tile}>
                      <View style={s.tileSheen} />
                      <Text display style={s.tileText}>{ch}</Text>
                    </LinearGradient>
                  ),
                )}
              </View>
            ) : (
              <Text display style={s.riddle}>{round.prompt}</Text>
            )}

            </ScrollView>
            {isOpen && round.kind !== 'social' && slots.length > 0 && (
              <View style={s.slotsWrap}>
                <Text style={s.slotsLabel}>CEVAP</Text>
                <View style={s.slotsRow}>
                  {slots.map((sl, i) =>
                    sl.sep ? (
                      <Text key={i} style={s.sepChar}>{sl.ch === ' ' ? '' : sl.ch}</Text>
                    ) : (
                      <View
                        key={i}
                        style={[s.slot, sl.known && s.slotKnown, sl.bought && s.slotBought]}
                      >
                        <Text display style={[s.slotText, sl.bought && { color: colors.cyan }]}>
                          {sl.known ? sl.ch.toLocaleUpperCase('tr-TR') : ''}
                        </Text>
                      </View>
                    ),
                  )}
                </View>
              </View>
            )}

            {isOpen && round.kind !== 'social' && (
              <View style={s.creditRow}>
                <CoinPill value={credits} label="kredi" />
                {slots.length > 0 && (
                  <Btn
                    title="Harf Al (1)"
                    icon="search"
                    tone="violet"
                    size="sm"
                    disabled={!canBuy || busy}
                    onPress={buyLetter}
                  />
                )}
              </View>
            )}

            {showHint && (
              <View style={s.hintBox}>
                <Ionicons name="bulb" size={16} color={colors.cyan} />
                <Text style={s.hintText}>İpucu: {round.hints[0]}</Text>
              </View>
            )}
          </Card>



          {/* ================= CEVAP GİRİŞİ ================= */}
          {isOpen ? (
            round.kind === 'social' ? (
              <View style={{ gap: 12 }}>
                <Card style={{ gap: 12 }}>
                  <Eyebrow icon="people" color={colors.violet}>Odadaki Oyuncular (Şıklar)</Eyebrow>
                  <ScrollView nestedScrollEnabled style={{maxHeight:Math.max(120,areaHeight-330)}} contentContainerStyle={{flexDirection:'row',flexWrap:'wrap',gap:8}}>
                    {data.players.map((p) => {
                      const isSelected = (me.is_captain ? final : text) === p.nickname;
                      const pColor = teamColor(p.team_side);
                      const pSuggestions = suggestions.filter((sug) => sug.body.trim().toLowerCase() === p.nickname.trim().toLowerCase()).length;
                      return (
                        <Tap
                          color={alpha(pColor, 0.3)}
                          accent={pColor}
                          scaleTo={0.96}
                          key={p.id}
                          onPress={() => {
                            soundFx.click();
                            haptic.light();
                            if (me.is_captain) {
                              setFinal(p.nickname);
                              sendFinal(p.nickname);
                            } else {
                              setText(p.nickname);
                              run(async () => {
                                const r = await api.submitAnswer(round.id, p.nickname);
                                if (r.suggested) {
                                  soundFx.pop();
                                  haptic.medium();
                                  show(`${p.nickname} önerisi takıma iletildi`, 'success');
                                }
                              });
                            }
                          }}
                          style={[
                            s.socialPlayerCard,{width:'48%',padding:6,minHeight:60,gap:5},
                            isSelected && s.socialPlayerCardSelected,
                          ]}
                        >
                          
                          <View style={{ flex: 1, gap: 2 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <Text numberOfLines={2} style={[s.socialNickText,{fontSize:12,flexShrink:1}]}>{p.nickname}{p.id === me.id ? ' (Sen)' : ''}</Text>
                              {pSuggestions > 0 && (
                                <Chip label={`${pSuggestions} öneri`} color={colors.cyan} size="sm" icon="chatbubbles" />
                              )}
                            </View>
                            <Text style={[s.socialTeamText, { color: pColor }]}>{teamName(p.team_side)}</Text>
                          </View>
                          <View style={[s.socialRadio, isSelected && s.socialRadioSelected]}>
                            {isSelected && <Ionicons name="checkmark" size={14} color="#05281A" />}
                          </View>
                        </Tap>
                      );
                    })}
                  </ScrollView>
                  {me.is_captain ? (
                    <Muted style={{ textAlign: 'center', fontSize: 13, marginTop: 4 }}>
                      Bir oyuncuya dokunup takımının nihai cevabı olarak onayla.
                    </Muted>
                  ) : (
                    <Muted style={{ textAlign: 'center', fontSize: 13, marginTop: 4 }}>
                      Bir oyuncuya dokunarak Kaptanına öneride bulun.
                    </Muted>
                  )}
                </Card>
              </View>
            ) : round.kind === 'anagram' ? (
              <View style={{ gap: 12 }}>
                <Input
                  icon="create"
                  value={text}
                  onChangeText={setText}
                  onSubmitEditing={submit}
                  placeholder="Cevabın…"
                  autoCapitalize="none"
                  autoCorrect={false}
                  maxLength={80}
                  editable={lockedLeft <= 0}
                />
                <Btn
                  title={lockedLeft > 0 ? `${Math.ceil(lockedLeft)} sn bekle` : 'Cevabı Gönder'}
                  icon={lockedLeft > 0 ? 'hourglass' : 'send'}
                  tone="success"
                  disabled={lockedLeft > 0 || !text.trim()}
                  loading={busy}
                  onPress={submit}
                />
              </View>
            ) : (
              <View style={{ gap: 12 }}>
                {suggestions.length>0&&<Btn size="sm" title={`Takım Önerileri (${suggestions.length})`} onPress={()=>setSuggestionsOpen(true)}/>}
                {suggestions.length > 0 && (
                 <Sheet visible={suggestionsOpen} onClose={()=>setSuggestionsOpen(false)}>
                  <Card style={{ gap: 10 }}>
                    <Eyebrow icon="chatbubbles" color={colors.muted}>Takım tahminleri</Eyebrow>
                    <View style={s.chips}>
                      {suggestions.map((a) => {
                        const who = data.players.find((p) => p.id === a.player_id)?.nickname ?? '?';
                        return (
                          <Tap
                            key={a.id}
                            disabled={!me.is_captain}
                            color={alpha(colors.cyan, 0.32)}
                            accent={colors.cyan}
                            scaleTo={0.93}
                            onPress={() => {setSuggestionsOpen(false);sendFinal(a.body);}}
                            style={[s.chip, me.is_captain && { borderColor: alpha(colors.cyan, 0.5) }]}
                          >
                            <Text style={s.chipText}>{a.body}</Text>
                            <Text style={s.chipWho}>{who}</Text>
                          </Tap>
                        );
                      })}
                    </View>
                    {me.is_captain && (
                      <Muted style={{ fontSize: 12 }}>Bir tahmine dokun → takım adına gönder.</Muted>
                    )}
                  </Card>
                  <Btn title="Oyuna Dön" onPress={()=>setSuggestionsOpen(false)}/>
                 </Sheet>
                )}

                <Input
                  icon="create"
                  value={me.is_captain ? final : text}
                  onChangeText={me.is_captain ? setFinal : setText}
                  placeholder={me.is_captain ? 'Nihai cevap (Kaptan)…' : 'Tahminini yaz…'}
                  autoCapitalize="none"
                  autoCorrect={false}
                  maxLength={80}
                />
                {me.is_captain ? (
                  <Btn
                    title="Takım Adına Onayla & Gönder"
                    tone="primary"
                    icon="shield-checkmark"
                    disabled={!final.trim()}
                    loading={busy}
                    onPress={() => sendFinal(final)}
                  />
                ) : (
                  <Btn
                    title="Takıma Öner"
                    tone="violet"
                    icon="chatbubble-ellipses"
                    disabled={!text.trim()}
                    loading={busy}
                    onPress={submit}
                  />
                )}
              </View>
            )
          ) : (
            <Pulse>
              <Card accent={resultColor} style={s.resultCard}>
                <View style={[s.resIcon, { backgroundColor: alpha(resultColor, 0.16), borderColor: alpha(resultColor, 0.5) }]}>
                  <Ionicons name={resultIcon} size={38} color={resultColor} />
                </View>
                <Title size={24}>
                  {round.winner_side
                    ? iWon
                      ? 'Parça Bizim!'
                      : `${teamName(round.winner_side)} parçayı aldı`
                    : 'Kimse bilemedi'}
                </Title>
                <View style={s.revealedPill}>
                  <Text style={s.revealedLabel}>Doğru Cevap</Text>
                  <Text display style={s.revealedText}>{round.revealed_answer}</Text>
                </View>
                {roundAnswers.length > 0 ? (
                  <View style={s.finalAnswers}>
                    <Eyebrow icon="chatbubbles" color={colors.muted}>Gönderilen Cevaplar</Eyebrow>
                    {roundAnswers.map((answer) => {
                      const sender = data.players.find((player) => player.id === answer.player_id);
                      const answerColor = answer.is_correct === true ? colors.mint : answer.is_correct === false ? colors.red : colors.cyan;
                      const answerLabel = answer.is_final
                        ? answer.is_correct === true ? 'Doğru karar' : 'Yanlış karar'
                        : 'Takım önerisi';
                      return (
                        <View key={answer.id} style={[s.finalAnswerRow, { borderColor: alpha(answerColor, 0.35) }]}>
                          <View style={s.finalAnswerMeta}>
                            <Text numberOfLines={1} style={s.finalAnswerSender}>
                              {sender?.nickname ?? 'Oyuncu'} · {teamName(answer.side)}
                            </Text>
                            <Chip
                              label={answerLabel}
                              icon={answer.is_final ? answer.is_correct ? 'checkmark-circle' : 'close-circle' : 'chatbubble-ellipses'}
                              color={answerColor}
                              size="sm"
                            />
                          </View>
                          <Text style={[s.finalAnswerBody, { color: answerColor }]}>{answer.body}</Text>
                        </View>
                      );
                    })}
                  </View>
                ) : (
                  <Muted style={{ textAlign: 'center' }}>Bu turda kayıtlı cevap bulunmuyor.</Muted>
                )}
                {round.winner_side && <Text style={{ fontSize: 46, marginTop: 4 }}>{prize?.emoji}</Text>}
              </Card>
            </Pulse>
          )}

          {!isOpen && round.status === 'resolved' && (
            <Card accent={colors.cyan} style={s.advanceCard}>
              <Eyebrow icon="eye" color={colors.cyan}>Tur sonucu</Eyebrow>
              {me.is_host ? (
               <View ref={shortcut.anchorRef} collapsable={false} onLayout={shortcut.measure}>
                <Btn
                  title={continueReady ? 'Sonraki Aşamaya Geç' : `Sonucu İncele · ${continueWait} sn`}
                  icon={continueReady ? 'play-forward' : 'hourglass'}
                  tone="primary"
                  size="md"
                  disabled={!continueReady || busy || room.paused}
                  loading={busy}
                  onPress={continueGame}
                />
               </View>
              ) : (
                <Muted style={{ textAlign: 'center' }}>Sonraki aşama için kurucu bekleniyor.</Muted>
              )}
            </Card>
          )}

          {/* ================= TAKIM AKSİYONLARI (JOKER & MOLA) ================= */}
          {!isOpen&&<View style={s.captainRow}>
            <Btn
              title={`Joker (${myTeam?.jokers_left ?? 0})`}
              icon="sparkles"
              tone="gold"
              size="md"
              disabled={!isOpen || !myTeam || (myTeam.jokers_left ?? 0) <= 0}
              onPress={joker}
              style={{ flex: 1 }}
            />
            {me.is_captain && (
              <Btn title="Mola" icon="pause" tone="ghost" size="md" onPress={pause} style={{ flex: 1 }} />
            )}
          </View>}
        </ScrollView>
       </PlayArea>
      </KeyboardAvoidingView>
      <NextShortcut visible={shortcut.show&&!room.paused} ready={continueReady} wait={continueWait} busy={busy} onPress={continueGame}/>

      {/* ================= OYUN DURAKLATILDI ================= */}
      {room.paused && (
        <View style={s.paused}>
          <View style={s.bigIcon}><Ionicons name="pause" size={40} color={colors.cyan} /></View>
          <Title size={26}>Oyun Duraklatıldı</Title>
          <Muted>Kaptanlar dilediğinde devam ettirebilir.</Muted>
          {me.is_captain && (
            <Btn title="Devam Et" icon="play" tone="success" onPress={pause} style={{ marginTop: 16, alignSelf: 'stretch' }} />
          )}
        </View>
      )}

      {/* ================= KAPTAN ONAY ================= */}
      <Sheet centered visible={!!confirmAnswer} onClose={() => setConfirmAnswer(null)}>
        <View style={s.warnCircle}>
          <Ionicons name="warning" size={30} color={colors.gold} />
        </View>
        <Title size={21} style={{ textAlign: 'center' }}>Takım Adına Gönderilsin mi?</Title>
        <View style={s.answerPreviewBox}>
          <Text display style={s.confirmBody}>“{confirmAnswer}”</Text>
        </View>
        <Muted style={{ textAlign: 'center' }}>
          {round.kind === 'social'
            ? 'Takımının ortak seçimi olarak onaylanacak ve parça takımına kazandırılacak!'
            : 'Dikkat: Cevap yanlışsa bu yapı parçası doğrudan rakip takıma devredilir!'}
        </Muted>
        <View style={{ flexDirection: 'row', gap: 12, marginTop: 8, alignSelf: 'stretch' }}>
          <Btn title="Vazgeç" tone="ghost" size="md" style={{ flex: 1 }} onPress={() => setConfirmAnswer(null)} />
          <Btn
            title="Gönder"
            icon={round.kind === 'social' ? 'checkmark-circle' : 'rocket'}
            tone={round.kind === 'social' ? 'success' : 'danger'}
            size="md"
            loading={busy}
            style={{ flex: 1 }}
            onPress={() => {
              const ans = confirmAnswer;
              if (!ans) return;
              setConfirmAnswer(null);
              run(async () => {
                await api.submitFinal(round.id, ans);
                setFinal('');
              });
            }}
          />
        </View>
      </Sheet>

      {toast}
    </Screen>
  );
}

const s = StyleSheet.create({
  scroll: { gap: 14, paddingBottom: 36, paddingTop: 6 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  bigIcon: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: alpha(colors.cyan, 0.12),
    borderWidth: 1,
    borderColor: alpha(colors.cyan, 0.4),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  briefingWrap: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 2 },
  briefingCard: { width: '100%', maxWidth: 420, alignItems: 'center', gap: 10, paddingVertical: 16 },
  briefingCountdown: { color: colors.text, fontSize: 64, fontWeight: '900', lineHeight: 72 },

  metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  metaLeft: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', flexShrink: 1 },

  questionCard: { padding: 18, gap: 16, alignItems: 'center' },
  questionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%', gap: 8 },
  prizeTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: alpha(colors.gold, 0.12),
    borderWidth: 1,
    borderColor: alpha(colors.gold, 0.4),
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 100,
  },
  prizeEmoji: { fontSize: 15 },
  prizeName: { color: colors.yellow, fontSize: 11, fontWeight: '700' },

  tiles: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 7, paddingVertical: 4 },
  tile: {
    width: 30,
    height: 38,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: '#FFF1B8',
    shadowColor: colors.gold,
    shadowOpacity: 0.6,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
  tileSheen: { position: 'absolute', top: 0, left: 0, right: 0, height: '45%', backgroundColor: 'rgba(255,255,255,0.28)' },
  tileText: { color: '#4A2A00', fontSize: 21, fontWeight: '900' },
  riddle: { color: colors.text, fontSize: 21, fontWeight: '800', textAlign: 'center', lineHeight: 30, paddingHorizontal: 4 },

  hintBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: alpha(colors.cyan, 0.08),
    borderWidth: 1,
    borderColor: alpha(colors.cyan, 0.3),
    borderRadius: 14,
    paddingVertical: 9,
    paddingHorizontal: 14,
    alignSelf: 'stretch',
  },
  hintText: { color: colors.cyan, fontWeight: '600', fontSize: 13, flex: 1 },

  slotsWrap: { alignItems: 'center', gap: 8, alignSelf: 'stretch' },
  slotsLabel: { color: colors.subtle, fontSize: 10, fontWeight: '700', letterSpacing: 2 },
  slotsRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6 },
  slot: {
    width: 31,
    height: 40,
    borderRadius: 10,
    backgroundColor: colors.inset,
    borderWidth: 1.5,
    borderColor: colors.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotKnown: { backgroundColor: alpha(colors.gold, 0.08), borderColor: alpha(colors.gold, 0.4) },
  slotBought: { borderColor: alpha(colors.cyan, 0.6), backgroundColor: alpha(colors.cyan, 0.1) },
  slotText: { color: colors.yellow, fontSize: 18, fontWeight: '800' },
  sepChar: { color: colors.muted, fontSize: 18, fontWeight: '800', alignSelf: 'center', minWidth: 8, textAlign: 'center' },
  creditRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: 10 },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    backgroundColor: colors.inset,
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.borderLight,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  chipText: { color: colors.text, fontWeight: '700', fontSize: 14 },
  chipWho: { color: colors.muted, fontSize: 11, fontWeight: '600' },

  socialPlayerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 16,
    backgroundColor: alpha(colors.surface2, 0.7),
    borderWidth: 1,
    borderColor: alpha('#fff', 0.08),
    gap: 12,
  },
  socialPlayerCardSelected: {
    borderColor: colors.mint,
    backgroundColor: alpha(colors.mint, 0.08),
  },
  socialNickText: { color: colors.text, fontWeight: '700', fontSize: 15 },
  socialTeamText: { fontSize: 12, fontWeight: '600' },
  socialRadio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: alpha(colors.text, 0.25),
    alignItems: 'center',
    justifyContent: 'center',
  },
  socialRadioSelected: {
    borderColor: colors.mint,
    backgroundColor: colors.mint,
  },

  resultCard: { alignItems: 'center', gap: 12, paddingVertical: 24, overflow: 'hidden' },
  finalAnswers: { width: '100%', gap: 7, marginTop: 4, padding: 10, borderRadius: 14, backgroundColor: colors.inset, borderWidth: 1, borderColor: colors.border },
  finalAnswerRow: { gap: 3, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 10, borderWidth: 1, backgroundColor: 'rgba(5,10,20,0.72)' },
  finalAnswerMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  finalAnswerSender: { flex: 1, color: colors.textSoft, fontSize: 10, fontWeight: '700' },
  finalAnswerBody: { fontSize: 16, fontWeight: '900' },
  resIcon: { width: 76, height: 76, borderRadius: 38, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  revealedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.inset,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  revealedLabel: { color: colors.muted, fontSize: 12, fontWeight: '600' },
  revealedText: { color: colors.yellow, fontSize: 17, fontWeight: '900' },

  captainRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  advanceCard: { gap: 10, paddingVertical: 12 },
  paused: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(5, 10, 20, 0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 10,
  },
  warnCircle: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: alpha(colors.gold, 0.12),
    borderWidth: 1,
    borderColor: alpha(colors.gold, 0.45),
    alignItems: 'center',
    justifyContent: 'center',
  },
  answerPreviewBox: {
    backgroundColor: colors.inset,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignSelf: 'stretch',
  },
  confirmBody: { color: colors.yellow, fontSize: 22, fontWeight: '900', textAlign: 'center' },
});
