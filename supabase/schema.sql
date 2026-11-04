-- La Discesa 2027. Paste into the Supabase SQL editor; safe to run again.
-- Tables stay closed: the site reaches them only through these functions, each checking a personal code.
-- Changing a function's arguments later leaves the old one behind: drop it first.

create table if not exists people (
  id text primary key,
  code_hash text not null unique,
  organizer boolean not null default false
);
alter table people add column if not exists name text check (char_length(name) <= 40);
alter table people add column if not exists line text check (char_length(line) <= 200);
alter table people add column if not exists position integer not null default 0;

-- Everything about the group lives here, not in the public site.
create table if not exists past_trips (
  year integer primary key check (year between 2000 and 2100),
  place text not null check (char_length(place) between 1 and 60),
  cost numeric not null check (cost between 0 and 100000)
);

create table if not exists photos (
  id text primary key check (char_length(id) between 1 and 40),
  year integer not null,
  alt text not null check (char_length(alt) between 1 and 200),
  width integer not null check (width between 1 and 10000),
  height integer not null check (height between 1 and 10000),
  position integer not null default 0,
  mime text not null check (mime in ('image/webp', 'image/jpeg', 'image/png')),
  data text not null check (char_length(data) <= 2000000)
);

-- Bounds also reject NaN and Infinity, which Postgres numerics accept and rank above every number.
create table if not exists quotes (
  id uuid primary key default gen_random_uuid(),
  person text not null references people (id) on delete cascade,
  note text not null default '' check (char_length(note) <= 120),
  dest text not null check (char_length(dest) between 1 and 40),
  days integer not null check (days between 1 and 14),
  pass_option boolean not null default false,
  people integer not null check (people between 1 and 50),
  cars integer not null check (cars between 1 and 50),
  km numeric not null check (km between 0 and 100000),
  consumption numeric not null check (consumption between 0 and 100),
  fuel_price numeric not null check (fuel_price between 0 and 100),
  tolls numeric not null check (tolls between 0 and 100000),
  flat_total numeric not null check (flat_total between 0 and 1000000),
  pass numeric not null check (pass between 0 and 100000),
  food_per_day numeric not null check (food_per_day between 0 and 10000),
  extras numeric not null check (extras between 0 and 100000),
  created_at timestamptz not null default now()
);

alter table quotes add column if not exists nights integer check (nights between 1 and 30);

-- Lodgings found by anyone in the group. The one marked official sets the published figures.
create table if not exists houses (
  id uuid primary key default gen_random_uuid(),
  person text not null references people (id) on delete cascade,
  dest text not null check (char_length(dest) between 1 and 40),
  name text not null check (char_length(name) between 1 and 80),
  zone text not null default '' check (char_length(zone) <= 80),
  url text not null default '' check (url = '' or (url ~ '^https://' and char_length(url) <= 500)),
  nights integer not null check (nights between 1 and 30),
  total numeric not null check (total between 1 and 100000),
  note text not null default '' check (char_length(note) <= 200),
  official boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index if not exists houses_one_official on houses (dest) where official;

-- Destinations may still change, so rankings are not tied to a fixed list here.
create table if not exists votes (
  person text primary key references people (id) on delete cascade,
  ranking text[] not null check (cardinality(ranking) <= 10),
  attending boolean not null,
  updated_at timestamptz not null default now()
);

-- One row per seat taken: the keys let nobody share a seat, or hold two.
create table if not exists seats (
  seat integer primary key check (seat between 1 and 4),
  person text not null unique references people (id) on delete cascade,
  updated_at timestamptz not null default now()
);

create table if not exists proposals (
  id uuid primary key default gen_random_uuid(),
  person text not null references people (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  status text not null default 'open' check (status in ('open', 'accepted', 'rejected')),
  created_at timestamptz not null default now()
);

alter table people enable row level security;
alter table quotes enable row level security;
alter table votes enable row level security;
alter table proposals enable row level security;
alter table past_trips enable row level security;
alter table photos enable row level security;
alter table houses enable row level security;
alter table seats enable row level security;
revoke all on people, quotes, votes, proposals, past_trips, photos, houses, seats from public, anon, authenticated;

create or replace function hash_code(p_code text) returns text
language sql immutable set search_path = public, pg_temp as $$
  select encode(sha256(convert_to(upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g')), 'UTF8')), 'hex');
$$;

create or replace function person_from_code(p_code text) returns people
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  found people;
begin
  select * into found from people where code_hash = hash_code(p_code);
  if found.id is null then
    raise exception 'bad_code';
  end if;
  return found;
end;
$$;

create or replace function login(p_code text) returns json
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  me people := person_from_code(p_code);
begin
  return json_build_object('person', me.id, 'name', me.name, 'line', me.line, 'organizer', me.organizer);
end;
$$;

create or replace function read_all(p_code text) returns json
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  me people := person_from_code(p_code);
begin
  return json_build_object(
    'people', (select coalesce(json_agg(json_build_object(
      'id', id, 'name', name, 'line', line, 'organizer', organizer
    ) order by position, id), '[]'::json) from people),
    'pastTrips', (select coalesce(json_agg(json_build_object(
      'year', year, 'place', place, 'cost', cost
    ) order by year), '[]'::json) from past_trips),
    -- Only the description: each picture is fetched on its own, when it comes into view.
    'photos', (select coalesce(json_agg(json_build_object(
      'id', id, 'year', year, 'alt', alt, 'width', width, 'height', height
    ) order by year, position, id), '[]'::json) from photos),
    'quotes', (select coalesce(json_agg(json_build_object(
      'id', id, 'person', person, 'note', note, 'dest', dest, 'days', days, 'passOption', pass_option,
      'people', q.people, 'cars', cars, 'km', km, 'consumption', consumption, 'fuelPrice', fuel_price, 'tolls', tolls,
      'flatTotal', flat_total, 'pass', pass, 'foodPerDay', food_per_day, 'extras', extras, 'nights', nights, 'createdAt', created_at
    ) order by created_at desc), '[]'::json) from quotes q),
    'houses', (select coalesce(json_agg(json_build_object(
      'id', id, 'person', person, 'dest', dest, 'name', name, 'zone', zone, 'url', url, 'nights', nights,
      'total', total, 'note', note, 'official', official, 'createdAt', created_at
    ) order by official desc, total / nights, created_at), '[]'::json) from houses),
    'votes', (select coalesce(json_agg(json_build_object(
      'person', person, 'ranking', ranking, 'attending', attending
    ) order by updated_at desc), '[]'::json) from votes),
    'seats', (select coalesce(json_agg(json_build_object('seat', seat, 'person', person) order by seat), '[]'::json) from seats),
    'proposals', (select coalesce(json_agg(json_build_object(
      'id', id, 'person', person, 'text', body, 'status', status, 'createdAt', created_at
    ) order by created_at desc), '[]'::json) from proposals)
  );
end;
$$;

create or replace function save_quote(p_code text, p_quote jsonb) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  me people := person_from_code(p_code);
  saved uuid;
begin
  insert into quotes (person, note, dest, days, pass_option, people, cars, km, consumption, fuel_price, tolls, flat_total, pass, food_per_day, extras, nights)
  values (
    me.id, coalesce(p_quote->>'note', ''), p_quote->>'dest', (p_quote->>'days')::integer, coalesce((p_quote->>'passOption')::boolean, false),
    (p_quote->>'people')::integer, (p_quote->>'cars')::integer, (p_quote->>'km')::numeric, (p_quote->>'consumption')::numeric,
    (p_quote->>'fuelPrice')::numeric, (p_quote->>'tolls')::numeric, (p_quote->>'flatTotal')::numeric, (p_quote->>'pass')::numeric,
    (p_quote->>'foodPerDay')::numeric, (p_quote->>'extras')::numeric, (p_quote->>'nights')::integer
  ) returning id into saved;
  return saved;
end;
$$;

create or replace function delete_quote(p_code text, p_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  me people := person_from_code(p_code);
begin
  delete from quotes where id = p_id and person = me.id;
  if not found then
    raise exception 'not_allowed';
  end if;
end;
$$;

create or replace function save_vote(p_code text, p_ranking text[], p_attending boolean) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  me people := person_from_code(p_code);
begin
  insert into votes (person, ranking, attending) values (me.id, p_ranking, p_attending)
  on conflict (person) do update set ranking = excluded.ranking, attending = excluded.attending, updated_at = now();
  if not p_attending then
    delete from seats where person = me.id;
  end if;
end;
$$;

-- A null seat gets up. A seat already taken stays with whoever took it first.
create or replace function choose_seat(p_code text, p_seat integer) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  me people := person_from_code(p_code);
begin
  if p_seat is null then
    delete from seats where person = me.id;
    return;
  end if;
  if exists (select 1 from votes where person = me.id and not attending) then
    raise exception 'not_attending';
  end if;
  if exists (select 1 from seats where seat = p_seat and person <> me.id) then
    raise exception 'seat_taken';
  end if;
  delete from seats where person = me.id;
  insert into seats (seat, person) values (p_seat, me.id);
exception
  when unique_violation then
    raise exception 'seat_taken';
end;
$$;

create or replace function save_proposal(p_code text, p_text text) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  me people := person_from_code(p_code);
  saved uuid;
begin
  insert into proposals (person, body) values (me.id, trim(p_text)) returning id into saved;
  return saved;
end;
$$;

create or replace function save_house(p_code text, p_house jsonb) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  me people := person_from_code(p_code);
  saved uuid;
begin
  insert into houses (person, dest, name, zone, url, nights, total, note)
  values (
    me.id, p_house->>'dest', trim(p_house->>'name'), trim(coalesce(p_house->>'zone', '')), trim(coalesce(p_house->>'url', '')),
    (p_house->>'nights')::integer, (p_house->>'total')::numeric, trim(coalesce(p_house->>'note', ''))
  ) returning id into saved;
  return saved;
end;
$$;

-- The author or the organizer.
create or replace function delete_house(p_code text, p_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  me people := person_from_code(p_code);
begin
  delete from houses where id = p_id and (person = me.id or me.organizer);
  if not found then
    raise exception 'not_allowed';
  end if;
end;
$$;

-- Marks the lodging official for its destination, or clears the mark if it already is.
create or replace function set_official_house(p_code text, p_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  me people := person_from_code(p_code);
  chosen houses;
begin
  if not me.organizer then
    raise exception 'not_allowed';
  end if;
  select * into chosen from houses where id = p_id;
  if chosen.id is null then
    raise exception 'not_found';
  end if;
  update houses set official = false where dest = chosen.dest and official;
  if not chosen.official then
    update houses set official = true where id = p_id;
  end if;
end;
$$;

create or replace function delete_proposal(p_code text, p_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  me people := person_from_code(p_code);
begin
  delete from proposals where id = p_id and person = me.id;
  if not found then
    raise exception 'not_allowed';
  end if;
end;
$$;

create or replace function set_proposal_status(p_code text, p_id uuid, p_status text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  me people := person_from_code(p_code);
begin
  if not me.organizer then
    raise exception 'not_allowed';
  end if;
  update proposals set status = p_status where id = p_id;
  if not found then
    raise exception 'not_found';
  end if;
end;
$$;

create or replace function read_photo(p_code text, p_id text) returns text
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  me people := person_from_code(p_code);
  found text;
begin
  select 'data:' || mime || ';base64,' || data into found from photos where id = p_id;
  if found is null then
    raise exception 'not_found';
  end if;
  return found;
end;
$$;

-- The organizer loads the group's own content with scripts/load-private.js.
create or replace function set_person(p_code text, p_id text, p_name text, p_line text, p_position integer) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  me people := person_from_code(p_code);
begin
  if not me.organizer then
    raise exception 'not_allowed';
  end if;
  update people set name = p_name, line = p_line, position = p_position where id = p_id;
  if not found then
    raise exception 'not_found';
  end if;
end;
$$;

create or replace function set_past_trip(p_code text, p_year integer, p_place text, p_cost numeric) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  me people := person_from_code(p_code);
begin
  if not me.organizer then
    raise exception 'not_allowed';
  end if;
  insert into past_trips (year, place, cost) values (p_year, p_place, p_cost)
  on conflict (year) do update set place = excluded.place, cost = excluded.cost;
end;
$$;

create or replace function save_photo(p_code text, p_id text, p_year integer, p_alt text, p_width integer, p_height integer, p_position integer, p_mime text, p_data text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  me people := person_from_code(p_code);
begin
  if not me.organizer then
    raise exception 'not_allowed';
  end if;
  insert into photos (id, year, alt, width, height, position, mime, data)
  values (p_id, p_year, p_alt, p_width, p_height, p_position, p_mime, p_data)
  on conflict (id) do update set year = excluded.year, alt = excluded.alt, width = excluded.width, height = excluded.height,
    position = excluded.position, mime = excluded.mime, data = excluded.data;
end;
$$;

revoke all on function hash_code(text), person_from_code(text) from public, anon, authenticated;
revoke all on function login(text), read_all(text), read_photo(text, text), save_quote(text, jsonb), delete_quote(text, uuid),
  save_vote(text, text[], boolean), choose_seat(text, integer), save_proposal(text, text), delete_proposal(text, uuid), set_proposal_status(text, uuid, text),
  save_house(text, jsonb), delete_house(text, uuid), set_official_house(text, uuid),
  set_person(text, text, text, text, integer), set_past_trip(text, integer, text, numeric),
  save_photo(text, text, integer, text, integer, integer, integer, text, text) from public, authenticated;
grant execute on function login(text), read_all(text), read_photo(text, text), save_quote(text, jsonb), delete_quote(text, uuid),
  save_vote(text, text[], boolean), choose_seat(text, integer), save_proposal(text, text), delete_proposal(text, uuid), set_proposal_status(text, uuid, text),
  save_house(text, jsonb), delete_house(text, uuid), set_official_house(text, uuid),
  set_person(text, text, text, text, integer), set_past_trip(text, integer, text, numeric),
  save_photo(text, text, integer, text, integer, integer, integer, text, text) to anon;
