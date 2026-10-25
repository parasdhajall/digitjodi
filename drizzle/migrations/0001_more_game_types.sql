create or replace function public.place_bet(_market uuid, _game text, _session text, _number text, _points integer)
returns integer language plpgsql security definer set search_path = public as $$
declare m public.markets; bal integer; distinct_ct integer;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if _points < 10 or _points > 10000 then raise exception 'Points must be between 10 and 10000'; end if;
  select * into m from public.markets where id=_market;
  if m.id is null or not m.active then raise exception 'Market closed'; end if;
  if _game not in ('single','jodi','single_panna','double_panna','triple_panna','half_sangam','full_sangam') then raise exception 'Invalid game'; end if;
  if _game in ('jodi','half_sangam','full_sangam') then
    _session := 'close';
    if m.open_panna is not null then raise exception 'This game closes after the open result'; end if;
  end if;
  if _session not in ('open','close') then raise exception 'Invalid session'; end if;
  if _session='open' and m.open_panna is not null then raise exception 'Open result already declared'; end if;
  if m.close_panna is not null then raise exception 'Result already declared'; end if;
  if _game like '%panna' then
    if _number !~ '^[0-9]{3}$' then raise exception 'Panna must be 3 digits'; end if;
    select count(distinct c) into distinct_ct from regexp_split_to_table(_number,'') c;
    if (_game='single_panna' and distinct_ct<>3) or (_game='double_panna' and distinct_ct<>2) or (_game='triple_panna' and distinct_ct<>1) then
      raise exception 'Number does not match this panna type'; end if;
  elsif (_game='single' and _number !~ '^[0-9]$') or (_game='jodi' and _number !~ '^[0-9]{2}$')
     or (_game='half_sangam' and _number !~ '^[0-9]-[0-9]{3}$') or (_game='full_sangam' and _number !~ '^[0-9]{3}-[0-9]{3}$') then
    raise exception 'Invalid number'; end if;
  select points into bal from public.profiles where id=auth.uid() for update;
  if bal < _points then raise exception 'Not enough points'; end if;
  update public.profiles set points = points - _points where id=auth.uid() returning points into bal;
  insert into public.bets(user_id, market_id, game_type, session, number, points) values (auth.uid(), _market, _game, _session, _number, _points);
  return bal;
end $$;

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