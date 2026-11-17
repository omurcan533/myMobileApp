alter table public.players
  drop constraint players_avatar_id_check,
  add constraint players_avatar_id_check check (avatar_id in ('fox','raccoon','eagle','bear','cat','panda','rabbit','wolf','owl','chameleon','tiger','penguin','koala','red_panda','lion','axolotl','capybara','otter','snow_leopard','toucan','crocodile','elephant','frog','magpie','lynx'));

create or replace function public.set_player_avatar(p_room uuid, p_avatar text)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_avatar is null or p_avatar not in ('fox','raccoon','eagle','bear','cat','panda','rabbit','wolf','owl','chameleon','tiger','penguin','koala','red_panda','lion','axolotl','capybara','otter','snow_leopard','toucan','crocodile','elephant','frog','magpie','lynx') then
    raise exception 'invalid_avatar';
  end if;
  update public.players set avatar_id = p_avatar where room_id = p_room and user_id = auth.uid();
  if not found then raise exception 'not_in_room'; end if;
end;
$$;
