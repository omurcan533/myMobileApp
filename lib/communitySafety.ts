import {supabase} from './supabase';
import {GameError} from './api';
export const COMMUNITY_VERSION = '2026-11-04';
export const COMMUNITY_URL = 'https://omurcan533.github.io/myMobileApp/community.html';
export type SafetyStatus = {accepted:boolean;restricted:boolean;version:string};
export type ReportSubject = 'player'|'team_A'|'team_B'|'room';
export type ReportReason = 'harassment'|'hate'|'sexual'|'personal_data'|'other';
async function request<T>(fn:string,args:Record<string,unknown>={}):Promise<T>{
 const {data,error}=await supabase.rpc(fn,args);
 if(error)throw new GameError(error.message);
 return data as T;
}
export const communitySafety={
 status:()=>request<SafetyStatus>('community_status'),
 accept:()=>request<void>('community_accept',{p_version:COMMUNITY_VERSION}),
 block:(room:string,player:string)=>request<void>('safety_block',{p_room:room,p_player:player}),
 blocks:()=>request<{id:string;label:string}[]>('safety_blocks'),
 unblock:(id:string)=>request<void>('safety_unblock',{p_user:id}),
 report:(room:string,player:string|null,subject:ReportSubject,reason:ReportReason,details:string)=>request<string>('safety_report',{p_room:room,p_player:player,p_subject:subject,p_reason:reason,p_details:details}),
};
