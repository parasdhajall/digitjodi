-- 1. ENUMS AND TYPES
create type public.app_role as enum ('admin','user');

-- 2. PROFILES TABLE
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  points integer not null default 1000,
  created_at timestamptz not null default now()
);
grant select, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

-- 3. USER ROLES TABLE
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role app_role not null,
  unique(user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

-- Role checking helper function
create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.user_roles where user_id=_user_id and role=_role)
$$;

create policy "own profile read" on public.profiles for select to authenticated using (id = auth.uid() or public.has_role(auth.uid(),'admin'));
create policy "own roles read" on public.user_roles for select to authenticated using (user_id = auth.uid());

-- 4. MARKETS TABLE
create table public.markets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  open_time time not null,
  close_time time not null,
  active boolean not null default true,
  open_panna text,
  close_panna text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
grant select on public.markets to anon, authenticated;
grant insert, update, delete on public.markets to authenticated;
grant all on public.markets to service_role;
alter table public.markets enable row level security;
create policy "markets public read" on public.markets for select to anon, authenticated using (true);
create policy "admin insert markets" on public.markets for insert to authenticated with check (public.has_role(auth.uid(),'admin'));
create policy "admin update markets" on public.markets for update to authenticated using (public.has_role(auth.uid(),'admin'));
create policy "admin delete markets" on public.markets for delete to authenticated using (public.has_role(auth.uid(),'admin'));

-- 5. BETS TABLE
create table public.bets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  market_id uuid not null references public.markets(id) on delete cascade,
  game_type text not null,
  session text not null,
  number text not null,
  points integer not null,
  status text not null default 'pending',
  payout integer not null default 0,
  created_at timestamptz not null default now()
);
grant select on public.bets to authenticated;
grant all on public.bets to service_role;
alter table public.bets enable row level security;
create policy "own bets read" on public.bets for select to authenticated using (user_id = auth.uid() or public.has_role(auth.uid(),'admin'));

-- 6. RESULTS HISTORY TABLE
create table public.results (
  id uuid primary key default gen_random_uuid(),
  market_id uuid not null references public.markets(id) on delete cascade,
  session text not null check (session in ('open','close')),
  panna text not null check (panna ~ '^[0-9]{3}$'),
  result_date date not null default (now() at time zone 'Asia/Kolkata')::date,
  created_at timestamptz not null default now(),
  unique (market_id, result_date, session)
);
grant select on public.results to anon, authenticated;
grant all on public.results to service_role;
alter table public.results enable row level security;
create policy "results public read" on public.results for select to anon, authenticated using (true);

-- 7. SIGNUP TRIGGER (First registered account automatically becomes admin with 1000 free points)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, display_name) values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(coalesce(new.email, new.phone, 'player'),'@',1)));
  if not exists (select 1 from public.user_roles where role='admin') then
    insert into public.user_roles(user_id, role) values (new.id,'admin');
  end if;
  insert into public.user_roles(user_id, role) values (new.id,'user');
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- 8. PANNA DIGIT CALCULATION HELPER
create or replace function public.panna_digit(p text) returns integer language sql immutable as $$
  select ((substr(p,1,1)::int + substr(p,2,1)::int + substr(p,3,1)::int) % 10)
$$;

-- 9. PLACE BET STORED FUNCTION
create or replace function public.place_bet(_market uuid, _game text, _session text, _number text, _points integer)
returns integer language plpgsql security definer set search_path = public as $$
declare
  m public.markets;
  bal integer;
  distinct_ct integer;
  now_t time;
  is_cross boolean;
  open_passed boolean;
  close_passed boolean;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if _points < 5 or _points > 10000 then raise exception 'Points must be between 5 and 10000'; end if;
  
  select * into m from public.markets where id=_market;
  if m.id is null or not m.active then raise exception 'Market closed'; end if;
  
  -- Time check in IST
  now_t := (now() at time zone 'Asia/Kolkata')::time;
  is_cross := (m.close_time <= m.open_time);

  -- Has Close passed?
  if not is_cross then
    close_passed := (now_t >= m.close_time);
  else
    close_passed := (now_t >= m.close_time and now_t < m.open_time);
  end if;

  if m.close_panna is not null or close_passed then
    raise exception 'Market has closed for today (% closed at %)', m.name, to_char(m.close_time, 'HH12:MI AM');
  end if;

  -- Has Open passed?
  if not is_cross then
    open_passed := (now_t >= m.open_time);
  else
    open_passed := (now_t >= m.open_time or now_t < m.close_time);
  end if;

  if _game not in ('single','jodi','single_panna','double_panna','triple_panna','half_sangam','full_sangam') then
    raise exception 'Invalid game';
  end if;

  -- Games decided by Open result (Jodi, Sangam) require Open session to be active
  if _game in ('jodi','half_sangam','full_sangam') then
    _session := 'close';
    if m.open_panna is not null or open_passed then
      raise exception 'Jodi & Sangam can only be played before Open timing (% Open was at %)', m.name, to_char(m.open_time, 'HH12:MI AM');
    end if;
  end if;

  if _session not in ('open','close') then raise exception 'Invalid session'; end if;

  -- Open session bet check: strictly forbidden once open time has passed or open result declared
  if _session = 'open' then
    if m.open_panna is not null or open_passed then
      raise exception 'Open session has closed for % (Open was at %). Please play Close session.', m.name, to_char(m.open_time, 'HH12:MI AM');
    end if;
  end if;

  -- Game number format validations
  if _game = 'single_panna' then
    if _number !~ '^[0-9]{3}$' then raise exception 'Panna must be 3 digits'; end if;
    select count(distinct c) into distinct_ct from regexp_split_to_table(_number,'') c;
    if distinct_ct <> 3 then raise exception 'Single panna needs 3 different digits'; end if;
  elsif _game like '%panna' then
    if _number !~ '^[0-9]{3}$' then raise exception 'Panna must be 3 digits'; end if;
    select count(distinct c) into distinct_ct from regexp_split_to_table(_number,'') c;
    if (_game='double_panna' and distinct_ct <> 2) or (_game='triple_panna' and distinct_ct <> 1) then
      raise exception 'Number does not match this panna type';
    end if;
  elsif (_game='single' and _number !~ '^[0-9]$') or (_game='jodi' and _number !~ '^[0-9]{2}$')
     or (_game='half_sangam' and _number !~ '^[0-9]-[0-9]{3}$') or (_game='full_sangam' and _number !~ '^[0-9]{3}-[0-9]{3}$') then
    raise exception 'Invalid number';
  end if;

  select points into bal from public.profiles where id=auth.uid() for update;
  if bal < _points then raise exception 'Not enough points'; end if;

  update public.profiles set points = points - _points where id=auth.uid() returning points into bal;
  insert into public.bets(user_id, market_id, game_type, session, number, points)
  values (auth.uid(), _market, _game, _session, _number, _points);

  return bal;
end $$;

-- 10. DECLARE RESULT STORED FUNCTION
create or replace function public.declare_result(_market uuid, _session text, _panna text)
returns void language plpgsql security definer set search_path = public as $$
declare d integer; od integer; m public.markets; b record; win boolean; mult integer;
begin
  if not public.has_role(auth.uid(),'admin') then raise exception 'Forbidden'; end if;
  if _panna !~ '^[0-9]{3}$' then raise exception 'Panna must be 3 digits'; end if;
  d := public.panna_digit(_panna);
  select * into m from public.markets where id=_market for update;
  if _session='open' then
    update public.markets set open_panna=_panna where id=_market;
  elsif _session='close' then
    if m.open_panna is null then raise exception 'Declare open result first'; end if;
    update public.markets set close_panna=_panna where id=_market;
    od := public.panna_digit(m.open_panna);
  else raise exception 'Invalid session'; end if;

  insert into public.results(market_id, session, panna, result_date)
  values (_market, _session, _panna, (now() at time zone 'Asia/Kolkata')::date)
  on conflict (market_id, result_date, session) do update set panna = excluded.panna;

  for b in select * from public.bets where market_id=_market and status='pending' and session=_session loop
    win := false; mult := 0;
    case b.game_type
      when 'single' then win := b.number = d::text; mult := 9;
      when 'jodi' then win := b.number = od::text || d::text; mult := 90;
      when 'panna' then win := b.number = _panna; mult := 140;
      when 'single_panna' then win := b.number = _panna; mult := 140;
      when 'double_panna' then win := b.number = _panna; mult := 280;
      when 'triple_panna' then win := b.number = _panna; mult := 600;
      when 'half_sangam' then win := b.number = od::text || '-' || _panna; mult := 1000;
      when 'full_sangam' then win := b.number = m.open_panna || '-' || _panna; mult := 10000;
      else win := false;
    end case;
    if win then
      update public.bets set status='won', payout=b.points*mult where id=b.id;
      update public.profiles set points = points + b.points*mult where id=b.user_id;
    else
      update public.bets set status='lost' where id=b.id;
    end if;
  end loop;
end $$;

-- 11. RESET MARKET STORED FUNCTION
create or replace function public.reset_market(_market uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role(auth.uid(),'admin') then raise exception 'Forbidden'; end if;
  update public.profiles p set points = p.points + s.total
    from (select user_id, sum(points) total from public.bets where market_id=_market and status='pending' group by user_id) s
    where p.id = s.user_id;
  update public.bets set status='refunded' where market_id=_market and status='pending';
  update public.markets set open_panna=null, close_panna=null where id=_market;
end $$;

grant execute on function public.place_bet(uuid,text,text,text,integer) to authenticated;
grant execute on function public.declare_result(uuid,text,text) to authenticated;
grant execute on function public.reset_market(uuid) to authenticated;

-- 12. INITIAL MARKETS DATA
insert into public.markets(name, open_time, close_time, sort_order, open_panna) values
 ('Sunrise Day','09:30','10:30',1,null),
 ('Lotus Morning','11:00','12:00',2,null),
 ('Royal Noon','13:15','14:15',3,null),
 ('Star Evening','16:00','18:00',4,null),
 ('Moon Night','21:00','23:00',5,null);
