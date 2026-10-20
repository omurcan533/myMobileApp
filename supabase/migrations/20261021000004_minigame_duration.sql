-- =============================================================================
-- Mini oyun süresini 60 saniyeye çıkarma (özellikle 6 parçalı hafıza oyunu için)
-- =============================================================================

create or replace function _start_minigame(p_room uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_kind minigame_kind := (case when random() < 0.5 then 'reflex' else 'social_guess' end)::minigame_kind;
  v_prompt text; v_starts timestamptz; v_ends timestamptz;
begin
  if v_kind = 'social_guess' then
    select prompt into v_prompt from questions where kind = 'social' and active order by random() limit 1;
    if v_prompt is null then v_kind := 'reflex'; end if;
  end if;

  if v_kind = 'reflex' then
    v_starts := now() + make_interval(secs => 2 + random() * 2);
    v_ends   := v_starts + interval '60 seconds';  -- 60 saniye süre
  else
    v_starts := now();
    v_ends   := now() + interval '40 seconds';
  end if;

  insert into room_minigames (room_id, kind, prompt, status, starts_at)
  values (p_room, v_kind, v_prompt, 'live', v_starts);

  update rooms set phase = 'minigame', phase_started_at = now(), phase_ends_at = v_ends
   where id = p_room;
end $$;
