-- Update only the initial custom-room pool, preserving random modes and saved picks.
do $migration$
declare
  definition text := pg_get_functiondef('public.create_room(text,public.game_mode)'::regprocedure);
  old_pool constant text := 'v_games:=array[''anagram'',''riddle'',''reflex'',''math_guess'',''social_guess'',''survivor_memory'',''line_connect'',''pong'',''tug_of_war''];';
  new_pool constant text := 'v_games:=array[''anagram'',''riddle'',''reflex'',''memory'',''math_guess'',''social_guess'',''survivor_memory'',''line_connect'',''pong'',''tug_of_war''];';
begin
  if position(new_pool in definition) > 0 then
    return;
  end if;
  if position(old_pool in definition) = 0 then
    raise exception 'Expected custom-room default pool was not found';
  end if;
  execute replace(definition, old_pool, new_pool);
end;
$migration$;
