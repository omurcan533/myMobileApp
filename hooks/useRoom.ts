import { AppState } from 'react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { coalescedTask } from '../lib/coalescedTask';
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
    const fetchRoom=async()=>{
      try {
        const q=<T,>(table:string,order='id')=>{
          const query=supabase.from(table).select('*');
          return (table==='rooms'?query.eq('id',roomId):query.eq('room_id',roomId)).order(order) as unknown as Promise<{data:T[]|null;error:unknown}>;
        };
        const results=await Promise.all([
          q<Room>('rooms'),q<Player>('players','joined_at'),q<TeamState>('room_teams','side'),
          q<Round>('room_rounds','idx'),q<Answer>('round_answers','created_at'),q<TeamPiece>('team_pieces','created_at'),
          q<Minigame>('room_minigames','created_at'),q<CanvasItem>('canvas_items','z_index'),q<Vote>('votes','created_at'),q<RoundReveal>('round_reveals','created_at'),
        ] as const);
        if(!active)return;
        if(results.some(r=>r.error))throw new Error('Room refresh failed');
        const [rooms,players,teams,rounds,answers,teamPieces,minigames,canvas,votes,reveals]=results;
        const room=rooms.data?.[0];
        if(!room){setGoneRoom(roomId);return;}
        const ids=(minigames.data??[]).map(m=>m.id);
        let entries:MinigameEntry[]=[];
        if(ids.length){
          const res=await supabase.from('minigame_entries').select('*').in('minigame_id',ids);
          if(res.error)throw res.error;
          entries=res.data??[];
        }
        if(!active)return;
        games=minigames.data??[];
        setGoneRoom(null);
        setData({room,players:players.data??[],teams:teams.data??[],rounds:rounds.data??[],answers:answers.data??[],teamPieces:teamPieces.data??[],minigames:games,canvas:canvas.data??[],votes:votes.data??[],reveals:reveals.data??[],entries});
      } catch(error) { if(active)console.warn('Room refresh will retry:',error); }
    };
    const load=coalescedTask(fetchRoom,()=>active);
    refreshRef.current=load;
    const schedule=()=>{if(timer)return;timer=setTimeout(()=>{timer=undefined;void load();},120);};
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
    ch.subscribe(status=>{if(status==='SUBSCRIBED')schedule();});
    const poll=setInterval(()=>void load(),6000);
    // Background timers can be suspended on mobile; refresh immediately on return.
    const appState=AppState.addEventListener('change',state=>{
      if(state==='active')schedule();
    });
    return()=>{active=false;appState.remove();if(timer)clearTimeout(timer);clearInterval(poll);void supabase.removeChannel(ch);};
  },[roomId]);
  return {data:data?.room.id===roomId?data:null,gone:goneRoom===roomId,refresh};
}
