-- 1. FIX PLACE_BET: Allow playing anytime before Open/Close timings (DPBOSS style)
create or replace function public.place_bet(_market uuid, _game text, _session text, _number text, _points integer)
returns integer language plpgsql security definer set search_path = public as $$
declare m public.markets; bal integer; distinct_ct integer; now_t time;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if _points < 10 or _points > 10000 then raise exception 'Points must be between 10 and 10000'; end if;
  select * into m from public.markets where id=_market;
  if m.id is null or not m.active then raise exception 'Market is closed'; end if;

  now_t := (now() at time zone 'Asia/Kolkata')::time;

  -- If close panna is already declared or time is past close time, the entire market is closed
  if m.close_panna is not null then
    raise exception 'Market has already closed for today';
  end if;

  if m.close_time > m.open_time then
    if now_t >= m.close_time then
      raise exception 'Market has closed for today (closed at %)', to_char(m.close_time, 'HH12:MI AM');
    end if;
  else
    -- overnight market (e.g., 21:40 to 00:05)
    if now_t >= m.close_time and now_t < m.open_time then
      raise exception 'Market has closed for today';
    end if;
  end if;

  -- Validate game type
  if _game not in ('single','jodi','single_panna','double_panna','triple_panna','half_sangam','full_sangam') then
    raise exception 'Invalid game type';
  end if;

  -- Jodi and Sangam can only be played before Open result
  if _game in ('jodi','half_sangam','full_sangam') then
    _session := 'close';
    if m.open_panna is not null then
      raise exception 'Jodi & Sangam close after the Open result is declared';
    end if;
    if m.close_time > m.open_time and now_t >= m.open_time then
      raise exception 'Open session has closed at %', to_char(m.open_time, 'HH12:MI AM');
    end if;
  end if;

  if _session not in ('open','close') then
    raise exception 'Invalid session';
  end if;

  -- If user chose 'open' session, verify open result not yet declared & time is before open_time
  if _session = 'open' then
    if m.open_panna is not null then
      raise exception 'Open result already declared';
    end if;
    if m.close_time > m.open_time and now_t >= m.open_time then
      raise exception 'Open session has closed at %', to_char(m.open_time, 'HH12:MI AM');
    end if;
  end if;

  -- Validation of number patterns
  if _game = 'single_panna' then
    if _number !~ '^[0-9]{3}$' then raise exception 'Panna must be 3 digits'; end if;
    select count(distinct c) into distinct_ct from regexp_split_to_table(_number,'') c;
    if distinct_ct<>3 then raise exception 'Single panna needs 3 different digits'; end if;
  elsif _game like '%panna' then
    if _number !~ '^[0-9]{3}$' then raise exception 'Panna must be 3 digits'; end if;
    select count(distinct c) into distinct_ct from regexp_split_to_table(_number,'') c;
    if (_game='double_panna' and distinct_ct<>2) or (_game='triple_panna' and distinct_ct<>1) then
      raise exception 'Number does not match this panna type'; end if;
  elsif (_game='single' and _number !~ '^[0-9]$') or (_game='jodi' and _number !~ '^[0-9]{2}$')
     or (_game='half_sangam' and _number !~ '^[0-9]-[0-9]{3}$') or (_game='full_sangam' and _number !~ '^[0-9]{3}-[0-9]{3}$') then
    raise exception 'Invalid number format';
  end if;

  -- Deduct points and place bet
  select points into bal from public.profiles where id=auth.uid() for update;
  if bal < _points then raise exception 'Not enough points (Your balance: % points)', bal; end if;
  update public.profiles set points = points - _points where id=auth.uid() returning points into bal;
  insert into public.bets(user_id, market_id, game_type, session, number, points)
  values (auth.uid(), _market, _game, _session, _number, _points);

  return bal;
end $$;

-- 2. ADD POPULAR REAL-WORLD BAZAR MARKETS (From DPBOSS)
-- Delete placeholder dummy markets first
delete from public.markets;

-- Insert real popular DPBoss markets
insert into public.markets(name, open_time, close_time, sort_order) values
 ('TIME BAZAR', '13:00', '14:00', 1),
 ('MADHUR DAY', '13:30', '14:30', 2),
 ('MILAN DAY', '15:00', '17:00', 3),
 ('KALYAN', '16:15', '18:15', 4),
 ('SRIDEVI NIGHT', '19:00', '20:00', 5),
 ('MADHUR NIGHT', '20:30', '22:30', 6),
 ('MILAN NIGHT', '21:00', '23:00', 7),
 ('KALYAN NIGHT', '21:25', '23:30', 8),
 ('RAJDHANI NIGHT', '21:35', '23:45', 9),
 ('MAIN BAZAR', '21:40', '00:05', 10);
