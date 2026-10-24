-- 20261024000013_host_controlled_captain_duel.sql
-- Kurucu kontrollü kaptanlık zar düellosu başlatma:
-- Takımlar belirlenip animasyon tamamlandıktan sonra, kurucu "Zar Düellosuna Başla" butonuna tıklayana kadar beklenir.

-- 1. _init_captain_duel fonksiyonunu 'started': false ile güncelle
create or replace function _init_captain_duel(p_room uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_pids_a uuid[];
  v_pids_b uuid[];
  v_duel jsonb;
begin
  -- Kaptan ve mimarları sıfırla
  update players
     set is_captain = false,
         is_architect = false
   where room_id = p_room;

  select array_agg(id order by joined_at, id) into v_pids_a
    from players
   where room_id = p_room and team_side = 'A';

  select array_agg(id order by joined_at, id) into v_pids_b
    from players
   where room_id = p_room and team_side = 'B';

  if v_pids_a is not null and array_length(v_pids_a, 1) > 0 then
    v_duel := jsonb_build_object(
      'started', false,
      'active_side', 'A',
      'round', 1,
      'tied_player_ids', to_jsonb(v_pids_a),
      'turn_player_id', v_pids_a[1],
      'current_roll', null,
      'rolls', '[]'::jsonb,
      'captains', '{}'::jsonb
    );
  elsif v_pids_b is not null and array_length(v_pids_b, 1) > 0 then
    v_duel := jsonb_build_object(
      'started', false,
      'active_side', 'B',
      'round', 1,
      'tied_player_ids', to_jsonb(v_pids_b),
      'turn_player_id', v_pids_b[1],
      'current_roll', null,
      'rolls', '[]'::jsonb,
      'captains', '{}'::jsonb
    );
  else
    v_duel := jsonb_build_object(
      'started', true,
      'active_side', 'done',
      'round', 1,
      'tied_player_ids', '[]'::jsonb,
      'turn_player_id', null,
      'current_roll', null,
      'rolls', '[]'::jsonb,
      'captains', '{}'::jsonb
    );
  end if;

  update rooms set captain_duel = v_duel where id = p_room;
  return v_duel;
end $$;

-- 2. Kurucu "Zar Düellosuna Başla" butonuna bastığında çalışan RPC
create or replace function start_captain_duel(p_room uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_host uuid;
  v_room rooms%rowtype;
  v_duel jsonb;
begin
  select host_user_id into v_host from rooms where id = p_room;
  if v_host <> auth.uid() then raise exception 'not_host'; end if;

  select * into v_room from rooms where id = p_room for update;
  if not found then raise exception 'room_not_found'; end if;

  v_duel := v_room.captain_duel;
  if v_duel is null then
    v_duel := _init_captain_duel(p_room);
  end if;

  v_duel := jsonb_set(v_duel, '{started}', 'true'::jsonb);

  update rooms set captain_duel = v_duel where id = p_room;
  return v_duel;
end $$;

revoke execute on function public.start_captain_duel(uuid) from public, anon;
grant execute on function public.start_captain_duel(uuid) to authenticated;
