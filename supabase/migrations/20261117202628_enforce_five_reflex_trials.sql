-- All entry paths, including older clients, must use the five-trial score.
create function public._require_reflex_trial_average()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  expected_ms integer;
begin
  if not exists (
    select 1
    from public.room_minigames game
    join public.players player on player.id = new.player_id and player.room_id = game.room_id
    where game.id = new.minigame_id and game.kind = 'reflex' and game.status = 'live'
      and not coalesce(player.is_bot, false)
      and (select sum(ascii(ch)) % 3 from regexp_split_to_table(game.id::text, '') ch) = 0
  ) then
    return new;
  end if;

  select round(progress.total_ms / 5.0)::int
  into expected_ms
  from public.reflex_trial_progress progress
  where progress.minigame_id = new.minigame_id
    and progress.player_id = new.player_id
    and progress.attempts = 5;
  if expected_ms is null or new.reaction_ms is distinct from expected_ms then
    raise exception 'reflex_trials_required';
  end if;
  return new;
end;
$$;
revoke execute on function public._require_reflex_trial_average() from public, anon, authenticated;

create trigger require_reflex_trial_average
before insert or update of minigame_id, player_id, reaction_ms on public.minigame_entries
for each row execute function public._require_reflex_trial_average();

-- Remove incomplete entries from live trials so those players can still play all five.
delete from public.minigame_entries entry
using public.room_minigames game, public.players player
where entry.minigame_id = game.id and entry.player_id = player.id
  and game.kind = 'reflex' and game.status = 'live' and not coalesce(player.is_bot, false)
  and (select sum(ascii(ch)) % 3 from regexp_split_to_table(game.id::text, '') ch) = 0
  and not exists (
    select 1 from public.reflex_trial_progress progress
    where progress.minigame_id = game.id and progress.player_id = player.id and progress.attempts = 5
  );
