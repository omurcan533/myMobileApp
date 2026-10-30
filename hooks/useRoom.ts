import { AppState } from 'react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { coalescedTask } from '../lib/coalescedTask';
import { syncServerTime } from '../lib/serverTime';
import type { Answer, CanvasItem, Minigame, MinigameEntry, Player, Room, RoomData, Round, RoundReveal, TeamPiece, TeamState, Vote } from '../lib/types';

/** Room-scoped, serialized refreshes; transient errors never eject a player. */
export function useRoom(roomId: string) {
  const [data,setData]=useState<RoomData|null>(null);
  const [goneRoom,setGoneRoom]=useState<string|null>(null);
  const refreshRef=useRef<()=>Promise<void>>(async()=>{});
  const refresh=useCallback(()=>refreshRef.current(),[]);
  useEffect(()=>{
    let active=true;
    let timer:ReturnType<typeof setTimeout>|undefined;
    let games:Minigame[]=[];
    let request:AbortController|undefined;
    const fetchRoom=async()=>{
      const controller=new AbortController();
      request=controller;
      const deadline=setTimeout(()=>controller.abort(),10000);
      try {
        const q=<T,>(table:string,order='id')=>{
          const query=supabase.from(table).select('*');
          return (table==='rooms'?query.eq('id',roomId):query.eq('room_id',roomId)).order(order).abortSignal(controller.signal) as unknown as Promise<{data:T[]|null;error:unknown}>;
        };
        const results=await Promise.all([
          q<Room>('rooms'),q<Player>('players','joined_at'),q<TeamState>('room_teams','side'),
          q<Round>('room_rounds','idx'),q<Answer>('round_answers','created_at'),q<TeamPiece>('team_pieces','created_at'),
          q<Minigame>('room_minigames','created_at'),q<CanvasItem>('canvas_items','z_index'),q<Vote>('votes','created_at'),q<RoundReveal>('round_reveals','created_at'),
        ] as const);
        if(!active||controller.signal.aborted)return;
        if(results.some(r=>r.error))throw new Error('Room refresh failed');
        const [rooms,players,teams,rounds,answers,teamPieces,minigames,canvas,votes,reveals]=results;
        const room=rooms.data?.[0];
        if(!room){setGoneRoom(roomId);return;}
        const ids=(minigames.data??[]).map(m=>m.id);
        let entries:MinigameEntry[]=[];
        if(ids.length){
          const res=await supabase.from('minigame_entries').select('*').in('minigame_id',ids).abortSignal(controller.signal);
          if(res.error)throw res.error;
          entries=res.data??[];
        }
        if(!active||controller.signal.aborted)return;
        games=minigames.data??[];
        setGoneRoom(null);
        setData({room,players:players.data??[],teams:teams.data??[],rounds:rounds.data??[],answers:answers.data??[],teamPieces:teamPieces.data??[],minigames:games,canvas:canvas.data??[],votes:votes.data??[],reveals:reveals.data??[],entries});
      } catch(error) { if(active&&!controller.signal.aborted)console.warn('Room refresh will retry:',error); }
      finally { clearTimeout(deadline);if(request===controller)request=undefined; }
    };
    const load=coalescedTask(fetchRoom,()=>active);
    refreshRef.current=load;
    const schedule=()=>{if(timer)return;timer=setTimeout(()=>{timer=undefined;void load();},120);};
    const syncClock=coalescedTask(syncServerTime,()=>active);
    const recover=()=>{
      if(!active)return;
      // A fetch started before connectivity returned must not block recovery or
      // publish an obsolete round/team snapshot after the reconnect signal.
      request?.abort();
      void load();
      void syncClock().catch(error=>console.warn('Clock sync will retry:',error));
    };
    void load();
    const ch=supabase.channel(`room-${roomId}`);
    for(const table of ['players','room_teams','room_rounds','round_answers','team_pieces','canvas_items','votes','round_reveals']){
      ch.on('postgres_changes',{event:'*',schema:'public',table,filter:`room_id=eq.${roomId}`},schedule);
    }
    ch.on('postgres_changes',{event:'*',schema:'public',table:'rooms',filter:`id=eq.${roomId}`},schedule);
    ch.on('postgres_changes',{event:'*',schema:'public',table:'room_minigames',filter:`room_id=eq.${roomId}`},payload=>{
      const next=payload.new as Partial<Minigame>;
      const old=games.find(g=>g.id===next.id);
      // Pong already has its frame channel. Do not refetch eleven tables for each physics tick.
      if(payload.eventType==='UPDATE'&&next.kind==='pong'&&next.status==='live'&&next.starts_at&&old?.status===next.status&&old.starts_at===next.starts_at)return;
      schedule();
    });
    ch.on('postgres_changes',{event:'*',schema:'public',table:'minigame_entries'},payload=>{
      const entry=(payload.eventType==='DELETE'?payload.old:payload.new) as Partial<MinigameEntry>;
      // PostgreSQL DELETE events may only contain the primary key (REPLICA IDENTITY
      // DEFAULT). Without minigame_id we cannot determine the affected room, so
      // refresh rather than leaving a removed player's entry visible until polling.
      if(payload.eventType==='DELETE'&&!entry.minigame_id){
        schedule();
        return;
      }
      if(entry.minigame_id&&games.some(g=>g.id===entry.minigame_id))schedule();
    });
    ch.subscribe(status=>{if(status==='SUBSCRIBED')recover();});
    const poll=setInterval(()=>void load(),6000);
    // Background timers can be suspended on mobile; refresh immediately on return.
    const appState=AppState.addEventListener('change',state=>{
      if(state==='active')recover();
    });
    return()=>{active=false;request?.abort();appState.remove();if(timer)clearTimeout(timer);clearInterval(poll);void supabase.removeChannel(ch);};
  },[roomId]);
  return {data:data?.room.id===roomId?data:null,gone:goneRoom===roomId,refresh};
}
