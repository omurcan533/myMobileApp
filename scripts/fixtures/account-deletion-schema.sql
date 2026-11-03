create role anon;create role authenticated;create role service_role bypassrls;
create schema auth;
create table auth.users(id uuid primary key);
create table auth.sessions(user_id uuid references auth.users on delete cascade);
create table rooms(id uuid primary key,host_user_id uuid not null references auth.users on delete cascade,
 paused bool default false,paused_at timestamptz,phase_ends_at timestamptz,captain_rolls jsonb,captain_duel jsonb);
create table players(id uuid primary key,room_id uuid references rooms on delete cascade,user_id uuid references auth.users on delete cascade,
 team_side text,is_captain bool default false,is_architect bool default false,is_host bool default false,joined_at timestamptz default now());
create unique index captain on players(room_id,team_side) where is_captain;
create unique index architect on players(room_id,team_side) where is_architect;
create table party_events(id uuid primary key,room_id uuid references rooms on delete cascade,target_id uuid references players on delete set null,status text);
create table party_court_cases(event_id uuid primary key references party_events on delete cascade,
 defendant_id uuid references players,prosecutor_id uuid references players,defender_id uuid references players);
create table party_court_ballots(event_id uuid references party_court_cases on delete cascade,player_id uuid references players);
create table party_court_speeches(event_id uuid references party_court_cases on delete cascade,player_id uuid references players,body text);
create table room_rounds(id uuid primary key,room_id uuid references rooms on delete cascade,status text,opens_at timestamptz,closes_at timestamptz,paused_ms bigint default 0);
create table room_minigames(id uuid primary key,room_id uuid references rooms on delete cascade,status text,starts_at timestamptz,
 pong_state jsonb,line_connect_state jsonb,survivor_state jsonb,math_state jsonb);
create table match_highlights(id uuid primary key,room_id uuid references rooms on delete cascade,player_id uuid references players on delete set null,payload jsonb not null default '{}');
create table round_answers(player_id uuid references players on delete cascade,body text);
create table survivor_team_messages(player_id uuid references players on delete cascade,body text);
create table friend_facts(player_id uuid references players on delete cascade,answer text);
