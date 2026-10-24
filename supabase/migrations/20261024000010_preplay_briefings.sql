create or replace function _reserve_round_briefing() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_round_seconds interval;
begin
  if new.status = 'open' and old.status is distinct from 'open' then
    v_round_seconds := coalesce(new.closes_at, now()) - coalesce(new.opens_at, now());
    new.opens_at := now() + interval '5 seconds';
    new.closes_at := new.opens_at + v_round_seconds;
  end if;
  return new;
end $$;

create trigger room_rounds_reserve_briefing
before update of status on public.room_rounds
for each row execute function _reserve_round_briefing();

create or replace function _guard_round_briefing() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_round room_rounds;
begin
  select * into v_round from room_rounds where id = new.round_id;
  if v_round.opens_at is not null and now() < v_round.opens_at then
    raise exception 'too_early';
  end if;
  return new;
end $$;

create trigger round_answers_wait_for_briefing
before insert on public.round_answers
for each row execute function _guard_round_briefing();

create trigger round_reveals_wait_for_briefing
before insert on public.round_reveals
for each row execute function _guard_round_briefing();

create or replace function _guard_round_resolution_briefing() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'resolved'
     and old.status = 'open'
     and old.opens_at is not null
     and now() < old.opens_at then
    raise exception 'too_early';
  end if;
  return new;
end $$;

create trigger room_rounds_resolve_after_briefing
before update of status on public.room_rounds
for each row execute function _guard_round_resolution_briefing();

create or replace function _reserve_minigame_briefing() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_minigame room_minigames;
  v_start_at timestamptz;
  v_delay interval;
begin
  if new.phase = 'minigame' and old.phase is distinct from 'minigame' then
    select * into v_minigame
      from room_minigames
     where room_id = new.id and status = 'live'
     order by created_at desc
     limit 1;

    if found and v_minigame.starts_at is not null then
      v_start_at := greatest(v_minigame.starts_at, now() + interval '5 seconds');
      v_delay := v_start_at - v_minigame.starts_at;
      if v_delay > interval '0 seconds' then
        update room_minigames set starts_at = v_start_at where id = v_minigame.id;
        new.phase_ends_at := new.phase_ends_at + v_delay;
      end if;
    end if;
  end if;
  return new;
end $$;

create trigger rooms_reserve_minigame_briefing
before update of phase on public.rooms
for each row execute function _reserve_minigame_briefing();

create or replace function _guard_minigame_briefing() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_starts_at timestamptz;
begin
  select starts_at into v_starts_at from room_minigames where id = new.minigame_id;
  if v_starts_at is not null and now() < v_starts_at then
    raise exception 'too_early';
  end if;
  return new;
end $$;

create trigger minigame_entries_wait_for_briefing
before insert on public.minigame_entries
for each row execute function _guard_minigame_briefing();

create or replace function _shift_briefings_on_resume() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_pause_gap interval;
begin
  if old.paused and not new.paused and old.paused_at is not null then
    v_pause_gap := now() - old.paused_at;

    update room_rounds
       set opens_at = opens_at + v_pause_gap
     where room_id = new.id
       and status = 'open'
       and opens_at > old.paused_at;

    update room_minigames
       set starts_at = starts_at + v_pause_gap
     where room_id = new.id
       and status = 'live'
       and starts_at > old.paused_at;
  end if;
  return new;
end $$;

create trigger rooms_shift_briefings_after_pause
before update of paused on public.rooms
for each row execute function _shift_briefings_on_resume();
