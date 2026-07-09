-- ============================================================
-- 부트캠프 팀 보드 — Supabase 설정 SQL (v2: 교육 세션 + 팀 상호 평가)
--
-- 사용법: Supabase 대시보드 → SQL Editor → New query
--         이 파일 전체를 붙여넣고 Run (여러 번 실행해도 안전)
--
-- v1(세션 개념이 없던 버전)에서 업그레이드하는 경우:
--   * 기존 명단/팀/공지는 '기본 교육' 세션으로 자동 이전됩니다.
--   * 이전된 세션의 입장 코드는 'bootcamp'로 설정됩니다 — 접속 후 바로 바꾸세요.
--   * 파일 저장 경로 체계가 바뀌어 기존 업로드 PPT 파일은 다시 올려야 합니다.
--
-- 실행 후 반드시:
--   Authentication → Sign In / Up → "Allow anonymous sign-ins" 켜기
-- ============================================================

create extension if not exists pgcrypto;

-- ---------------- 테이블 ----------------
create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  team_count int not null default 5,
  notice text not null default '',
  notice_updated_at timestamptz,
  eval_open boolean not null default false,
  created_at timestamptz not null default now()
);

-- 입장 코드: SELECT 정책이 관리자 전용 → 일반 사용자는 코드를 읽을 수 없음
create table if not exists public.session_codes (
  session_id uuid primary key references public.sessions(id) on delete cascade,
  code text not null
);
create unique index if not exists session_codes_code_uniq on public.session_codes (lower(code));

create table if not exists public.people (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  name text not null,
  dept text not null default '',
  student_no text not null default '',
  team int,
  pin int,
  created_at timestamptz not null default now()
);
alter table public.people add column if not exists student_no text not null default '';

create table if not exists public.teams (
  session_id uuid not null references public.sessions(id) on delete cascade,
  idx int not null,
  name text not null,
  ppt text not null default '',
  link text not null default '',
  memo text not null default '',
  ppt_file jsonb,
  primary key (session_id, idx)
);

-- API 키는 별도 테이블: RLS로 "관리자 + 그 조 팀원"만 읽게 함
create table if not exists public.team_secrets (
  session_id uuid not null references public.sessions(id) on delete cascade,
  idx int not null,
  api text not null default '',
  primary key (session_id, idx),
  constraint team_secrets_team_fkey foreign key (session_id, idx)
    references public.teams(session_id, idx) on delete cascade
);

create table if not exists public.settings (
  id int primary key check (id = 1),
  admin_set boolean not null default false
);

-- 비밀번호 해시 보관용: SELECT 정책이 없어 API로는 절대 읽을 수 없음
create table if not exists public.private_settings (
  id int primary key check (id = 1),
  admin_hash text
);

-- 익명 auth 사용자(uid) ↔ 역할/세션 매핑
create table if not exists public.profiles (
  uid uuid primary key,
  role text not null check (role in ('admin', 'member', 'viewer')),
  person_id uuid references public.people(id) on delete cascade,
  session_id uuid references public.sessions(id) on delete set null,
  created_at timestamptz not null default now()
);

-- v1 profiles 업그레이드: session_id 추가 + role에 viewer 허용
alter table public.profiles add column if not exists session_id uuid references public.sessions(id) on delete set null;
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('admin', 'member', 'viewer'));

-- ---------------- v1 → v2 데이터 마이그레이션 ----------------
-- people.session_id가 없으면 v1 스키마로 판단하고 1회만 실행됨
do $$
declare sid uuid;
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'people' and column_name = 'session_id') then

    alter table public.people add column session_id uuid references public.sessions(id) on delete cascade;
    alter table public.teams add column session_id uuid references public.sessions(id) on delete cascade;
    alter table public.team_secrets add column session_id uuid references public.sessions(id) on delete cascade;

    -- 기존 데이터를 '기본 교육' 세션으로 이전 (v1 settings의 팀 수/공지 승계)
    insert into public.sessions (name, team_count, notice, notice_updated_at)
    select '기본 교육', s.team_count, s.notice, s.notice_updated_at
    from public.settings s where s.id = 1
    returning id into sid;
    if sid is null then
      insert into public.sessions (name) values ('기본 교육') returning id into sid;
    end if;
    insert into public.session_codes (session_id, code) values (sid, 'bootcamp');

    update public.people set session_id = sid;
    update public.teams set session_id = sid;
    update public.team_secrets set session_id = sid;
    -- 파일 경로 체계 변경(세션 폴더 추가)으로 기존 파일 메타는 초기화 — 다시 업로드 필요
    update public.teams set ppt_file = null;

    update public.profiles pr set session_id = pe.session_id
    from public.people pe where pr.person_id = pe.id;
    update public.profiles set session_id = sid where session_id is null and role = 'admin';

    -- 제약 조건 재구성 (단일 세션 PK → 복합 PK)
    alter table public.people alter column session_id set not null;
    alter table public.teams alter column session_id set not null;
    alter table public.team_secrets alter column session_id set not null;
    alter table public.people drop constraint if exists people_name_key;
    alter table public.teams drop constraint teams_pkey cascade;
    alter table public.teams add primary key (session_id, idx);
    alter table public.team_secrets drop constraint team_secrets_pkey;
    alter table public.team_secrets add primary key (session_id, idx);
    alter table public.team_secrets add constraint team_secrets_team_fkey
      foreign key (session_id, idx) references public.teams(session_id, idx) on delete cascade;
  end if;
end $$;

-- 이름은 세션 안에서만 유일하면 됨
create unique index if not exists people_session_name_uniq on public.people (session_id, name);

-- ---------------- 팀 상호 평가 ----------------
create table if not exists public.evaluations (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  to_team int not null,
  from_team int,                                                    -- null = 관리자 평가
  evaluator_person uuid references public.people(id) on delete cascade,
  evaluator_uid uuid,                                               -- 관리자 평가 식별용
  score int check (score between 1 and 10),
  comment text not null default '',
  updated_at timestamptz not null default now()
);
create unique index if not exists eval_person_uniq on public.evaluations (session_id, evaluator_person, to_team)
  where evaluator_person is not null;
create unique index if not exists eval_admin_uniq on public.evaluations (session_id, evaluator_uid, to_team)
  where evaluator_uid is not null;

-- ---------------- RLS ----------------
alter table public.sessions enable row level security;
alter table public.session_codes enable row level security;
alter table public.people enable row level security;
alter table public.teams enable row level security;
alter table public.team_secrets enable row level security;
alter table public.settings enable row level security;
alter table public.private_settings enable row level security;
alter table public.profiles enable row level security;
alter table public.evaluations enable row level security;

-- ---------------- 권한 헬퍼 ----------------
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where uid = auth.uid() and role = 'admin');
$$;

create or replace function public.my_session() returns uuid
language sql stable security definer set search_path = public as $$
  select session_id from public.profiles where uid = auth.uid();
$$;

create or replace function public.my_team() returns int
language sql stable security definer set search_path = public as $$
  select pe.team
  from public.profiles pr
  join public.people pe on pe.id = pr.person_id
  where pr.uid = auth.uid() and pr.role = 'member';
$$;

-- storage 정책용: '<세션uuid>/team-3/file' 경로를 그 조 팀원/관리자만 만지게
create or replace function public.can_edit_team_object(p_name text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare m text[]; sid uuid; t int;
begin
  if public.is_admin() then return true; end if;  -- 관리자는 구버전 경로 파일 정리도 가능
  m := regexp_match(p_name, '^([0-9a-fA-F-]{36})/team-([0-9]+)/');
  if m is null then return false; end if;
  sid := m[1]::uuid;
  t := m[2]::int;
  return public.my_session() = sid and public.my_team() = t;
exception when others then
  return false;
end $$;

-- ---------------- 읽기 정책 ----------------
-- 세션에 입장한 사람만 그 세션의 데이터를 읽을 수 있음 (관리자는 전체)
drop policy if exists sessions_read on public.sessions;
create policy sessions_read on public.sessions for select
  using (public.is_admin() or id = public.my_session());

drop policy if exists session_codes_read on public.session_codes;
create policy session_codes_read on public.session_codes for select
  using (public.is_admin());

-- 명단 직접 조회는 차단하고 뷰로만 읽게 함: 학번은 관리자에게만 노출
-- (세션 참가자가 남의 학번을 조회해 그 계정으로 로그인하는 것을 방지)
drop policy if exists people_read on public.people;
drop view if exists public.people_view;
create view public.people_view with (security_barrier) as
  select id, session_id, name, dept,
         case when public.is_admin() then student_no else '' end as student_no,
         team, pin, created_at
  from public.people
  where public.is_admin() or session_id = public.my_session();
grant select on public.people_view to anon, authenticated;

drop policy if exists teams_read on public.teams;
create policy teams_read on public.teams for select
  using (public.is_admin() or session_id = public.my_session());

drop policy if exists secrets_read on public.team_secrets;
create policy secrets_read on public.team_secrets for select
  using (public.is_admin() or (session_id = public.my_session() and public.my_team() = idx));

drop policy if exists settings_read on public.settings;
create policy settings_read on public.settings for select using (true);

drop policy if exists profiles_read_own on public.profiles;
create policy profiles_read_own on public.profiles for select using (uid = auth.uid());

-- 평가: 관리자는 전부, 팀원은 본인이 제출한 것만 (수정용)
drop policy if exists eval_read on public.evaluations;
create policy eval_read on public.evaluations for select
  using (public.is_admin()
      or evaluator_uid = auth.uid()
      or (evaluator_person is not null
          and evaluator_person = (select person_id from public.profiles where uid = auth.uid())));

-- 쓰기 정책은 일부러 없음: 모든 쓰기는 아래 RPC 함수(security definer)로만 가능

-- ---------------- 로그인 / 계정 ----------------
-- 최초 실행이면 입력한 비밀번호가 곧 관리자 비밀번호로 설정됨
create or replace function public.admin_login(p_password text) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare h text;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select admin_hash into h from private_settings where id = 1;
  if h is null then
    if length(coalesce(p_password, '')) < 4 then raise exception 'PW_TOO_SHORT'; end if;
    update private_settings set admin_hash = crypt(p_password, gen_salt('bf')) where id = 1;
    update settings set admin_set = true where id = 1;
  elsif h <> crypt(coalesce(p_password, ''), h) then
    raise exception 'BAD_PASSWORD';
  end if;
  insert into profiles (uid, role, person_id) values (auth.uid(), 'admin', null)
  on conflict (uid) do update set role = 'admin', person_id = null;  -- session_id는 유지
  return 'ok';
end $$;

create or replace function public.change_admin_password(p_old text, p_new text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare h text;
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  select admin_hash into h from private_settings where id = 1;
  if h is null or h <> crypt(coalesce(p_old, ''), h) then raise exception 'BAD_PASSWORD'; end if;
  if length(coalesce(p_new, '')) < 4 then raise exception 'PW_TOO_SHORT'; end if;
  update private_settings set admin_hash = crypt(p_new, gen_salt('bf')) where id = 1;
end $$;

-- 입장 코드로 세션에 들어가기 (모든 사용자의 진입점)
create or replace function public.enter_session(p_code text) returns text
language plpgsql security definer set search_path = public as $$
declare v_sid uuid; v_name text;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select sc.session_id, s.name into v_sid, v_name
  from session_codes sc join sessions s on s.id = sc.session_id
  where lower(sc.code) = lower(trim(coalesce(p_code, ''))) and trim(coalesce(p_code, '')) <> '';
  if v_sid is null then raise exception 'BAD_CODE'; end if;
  -- 참여코드 입장은 '학생 입구': 관리자 세션이어도 둘러보기로 강등
  -- (공용 PC에서 관리자 권한이 새는 것 방지 — 관리자는 #admin에서 비밀번호로 재로그인)
  -- 같은 세션의 팀원이 다시 들어오면 팀원 유지
  insert into profiles (uid, role, person_id, session_id) values (auth.uid(), 'viewer', null, v_sid)
  on conflict (uid) do update set
    session_id = v_sid,
    role = case when profiles.role <> 'admin' and profiles.session_id = v_sid then profiles.role else 'viewer' end,
    person_id = case when profiles.role <> 'admin' and profiles.session_id = v_sid then profiles.person_id else null end;
  return v_name;
end $$;

-- 팀원 입장: 참여코드 + 학번 + 이름 (코드는 서버가 검증)
-- 명단에 있으면 매칭해 로그인, 없으면 자동 등록(팀 미배정). 팀 배정은 관리자가.
drop function if exists public.member_login(text);        -- 구버전 시그니처들 제거
drop function if exists public.member_login(text, text);
create or replace function public.member_enter(p_name text, p_student_no text, p_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare per public.people%rowtype; v_sid uuid; h text; v_name text; v_sno text;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  v_sid := public.my_session();
  if v_sid is null then raise exception 'NO_SESSION'; end if;
  select code into h from session_codes where session_id = v_sid;
  if h is null or lower(h) <> lower(trim(coalesce(p_code, ''))) then raise exception 'BAD_CODE'; end if;
  v_name := trim(coalesce(p_name, ''));
  v_sno := trim(coalesce(p_student_no, ''));
  if v_name = '' then raise exception 'NO_NAME'; end if;
  if v_sno = '' then raise exception 'NO_SNO'; end if;

  -- 1) 학번 일치 → 이름 확인 후 로그인 (동명이인 자동 접미사 '이름(1234)'도 허용)
  select * into per from people
  where session_id = v_sid and student_no = v_sno
  order by created_at limit 1;
  if found then
    if per.name <> v_name and per.name not like v_name || '(%' then raise exception 'BAD_MATCH'; end if;
  else
    -- 2) 이름 일치 + 학번 미기록(관리자가 학번 없이 올린 명단) → 학번을 붙이고 로그인
    select * into per from people
    where session_id = v_sid and name = v_name and student_no = ''
    order by created_at limit 1;
    if found then
      update people set student_no = v_sno where id = per.id;
    else
      -- 3) 신규 자동 등록. 동명이인이 있으면 학번 끝 4자리로 구분
      if exists (select 1 from people where session_id = v_sid and name = v_name) then
        v_name := v_name || '(' || right(v_sno, 4) || ')';
      end if;
      insert into people (session_id, name, dept, student_no) values (v_sid, v_name, '', v_sno)
      returning * into per;
    end if;
  end if;

  insert into profiles (uid, role, person_id, session_id) values (auth.uid(), 'member', per.id, v_sid)
  on conflict (uid) do update set role = 'member', person_id = per.id, session_id = v_sid;
  return per.id;
end $$;

-- 로그아웃: 세션은 유지한 채 둘러보기로 강등
create or replace function public.logout() returns void
language sql security definer set search_path = public as $$
  update public.profiles set role = 'viewer', person_id = null where uid = auth.uid();
$$;

-- v1 잔재 제거
drop function if exists public.set_access_code(text);

-- ---------------- 세션 관리 (관리자) ----------------
create or replace function public.create_session(p_name text, p_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_sid uuid;
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  if trim(coalesce(p_name, '')) = '' then raise exception 'NO_NAME'; end if;
  if trim(coalesce(p_code, '')) = '' then raise exception 'EMPTY_CODE'; end if;
  insert into sessions (name) values (trim(p_name)) returning id into v_sid;
  begin
    insert into session_codes (session_id, code) values (v_sid, trim(p_code));
  exception when unique_violation then
    raise exception 'CODE_TAKEN';
  end;
  insert into teams (session_id, idx, name) select v_sid, i, (i + 1) || '조' from generate_series(0, 14) i;
  insert into team_secrets (session_id, idx) select v_sid, i from generate_series(0, 14) i;
  update profiles set session_id = v_sid where uid = auth.uid();
  return v_sid;
end $$;

create or replace function public.set_admin_session(p_session uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  if not exists (select 1 from sessions where id = p_session) then raise exception 'BAD_SESSION'; end if;
  update profiles set session_id = p_session where uid = auth.uid();
end $$;

create or replace function public.rename_session(p_name text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  if public.my_session() is null then raise exception 'NO_SESSION'; end if;
  if trim(coalesce(p_name, '')) = '' then raise exception 'NO_NAME'; end if;
  update sessions set name = trim(p_name) where id = public.my_session();
end $$;

create or replace function public.set_session_code(p_code text) returns void
language plpgsql security definer set search_path = public as $$
declare v_sid uuid;
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  v_sid := public.my_session();
  if v_sid is null then raise exception 'NO_SESSION'; end if;
  if trim(coalesce(p_code, '')) = '' then raise exception 'EMPTY_CODE'; end if;
  begin
    insert into session_codes (session_id, code) values (v_sid, trim(p_code))
    on conflict (session_id) do update set code = excluded.code;
  exception when unique_violation then
    raise exception 'CODE_TAKEN';
  end;
end $$;

create or replace function public.delete_session() returns void
language plpgsql security definer set search_path = public as $$
declare v_sid uuid;
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  v_sid := public.my_session();
  if v_sid is null then raise exception 'NO_SESSION'; end if;
  delete from sessions where id = v_sid;  -- 명단/팀/평가/코드 전부 cascade 삭제
end $$;

-- ---------------- 명단 (관리자, 현재 세션 대상) ----------------
-- 이름 기준 병합: 같은 이름은 배정/고정 유지, 새 이름 추가, 빠진 이름 제거
create or replace function public.merge_roster(p_people jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare rec record; v_sid uuid; v_total int; v_kept int; v_removed int;
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  v_sid := public.my_session();
  if v_sid is null then raise exception 'NO_SESSION'; end if;
  v_total := coalesce(jsonb_array_length(p_people), 0);
  if v_total = 0 then raise exception 'EMPTY_ROSTER'; end if;

  select count(*) into v_kept from people
  where session_id = v_sid and name in (select x->>'name' from jsonb_array_elements(p_people) x);

  for rec in select x->>'name' as name, coalesce(x->>'dept', '') as dept, coalesce(x->>'sno', '') as sno
             from jsonb_array_elements(p_people) x loop
    insert into people (session_id, name, dept, student_no) values (v_sid, rec.name, rec.dept, rec.sno)
    on conflict (session_id, name) do update
      set dept = case when excluded.dept <> '' then excluded.dept else people.dept end,
          student_no = case when excluded.student_no <> '' then excluded.student_no else people.student_no end;
  end loop;

  delete from people
  where session_id = v_sid and name not in (select x->>'name' from jsonb_array_elements(p_people) x);
  get diagnostics v_removed = row_count;

  return jsonb_build_object('kept', v_kept, 'added', v_total - v_kept, 'removed', v_removed);
end $$;

drop function if exists public.add_person(text, text);  -- 학번 파라미터 추가로 시그니처 변경
create or replace function public.add_person(p_name text, p_dept text default '', p_student_no text default '') returns void
language plpgsql security definer set search_path = public as $$
declare v_sid uuid;
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  v_sid := public.my_session();
  if v_sid is null then raise exception 'NO_SESSION'; end if;
  if trim(coalesce(p_name, '')) = '' then raise exception 'NO_NAME'; end if;
  insert into people (session_id, name, dept, student_no)
  values (v_sid, trim(p_name), coalesce(p_dept, ''), trim(coalesce(p_student_no, '')));
end $$;

create or replace function public.remove_person(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  delete from people where id = p_id and session_id = public.my_session();
end $$;

create or replace function public.clear_people() returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  if public.my_session() is null then raise exception 'NO_SESSION'; end if;
  delete from people where session_id = public.my_session();
end $$;

-- ---------------- 배정 (관리자, 현재 세션 대상) ----------------
-- [{"id":"uuid","team":0,"pin":null}, ...] 형태 (team/pin은 null 가능)
create or replace function public.apply_assign(p_assign jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare x jsonb; v_sid uuid;
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  v_sid := public.my_session();
  if v_sid is null then raise exception 'NO_SESSION'; end if;
  for x in select * from jsonb_array_elements(p_assign) loop
    update people
    set team = (x->>'team')::int, pin = (x->>'pin')::int
    where id = (x->>'id')::uuid and session_id = v_sid;
  end loop;
end $$;

create or replace function public.reset_assign() returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  if public.my_session() is null then raise exception 'NO_SESSION'; end if;
  update people set team = null, pin = null where session_id = public.my_session();
end $$;

create or replace function public.set_team_count(p_n int) returns void
language plpgsql security definer set search_path = public as $$
declare v_sid uuid;
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  v_sid := public.my_session();
  if v_sid is null then raise exception 'NO_SESSION'; end if;
  if p_n < 1 or p_n > 15 then raise exception 'BAD_COUNT'; end if;
  update sessions set team_count = p_n where id = v_sid;
  update people set team = null where session_id = v_sid and team >= p_n;
  update people set pin = null where session_id = v_sid and pin >= p_n;
end $$;

create or replace function public.rename_team(p_idx int, p_name text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  if public.my_session() is null then raise exception 'NO_SESSION'; end if;
  update teams set name = coalesce(nullif(trim(p_name), ''), (p_idx + 1) || '조')
  where session_id = public.my_session() and idx = p_idx;
end $$;

-- ---------------- 팀 정보 (현재 세션 대상) ----------------
create or replace function public.set_team_api(p_idx int, p_api text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  if public.my_session() is null then raise exception 'NO_SESSION'; end if;
  update team_secrets set api = coalesce(p_api, '')
  where session_id = public.my_session() and idx = p_idx;
end $$;

-- ppt/link/memo: 관리자 또는 그 조 팀원만
create or replace function public.update_team_field(p_idx int, p_field text, p_value text) returns void
language plpgsql security definer set search_path = public as $$
declare v_sid uuid;
begin
  if p_field not in ('ppt', 'link', 'memo') then raise exception 'BAD_FIELD'; end if;
  v_sid := public.my_session();
  if v_sid is null then raise exception 'NO_SESSION'; end if;
  if not (public.is_admin() or public.my_team() = p_idx) then raise exception 'NOT_ALLOWED'; end if;
  execute format('update public.teams set %I = $1 where session_id = $2 and idx = $3', p_field)
  using coalesce(p_value, ''), v_sid, p_idx;
end $$;

-- 파일 메타 저장 (업로더/시각은 서버가 기록). p_file이 null이면 삭제
create or replace function public.set_team_file(p_idx int, p_file jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare who text; v_sid uuid;
begin
  v_sid := public.my_session();
  if v_sid is null then raise exception 'NO_SESSION'; end if;
  if not (public.is_admin() or public.my_team() = p_idx) then raise exception 'NOT_ALLOWED'; end if;
  if p_file is null then
    update teams set ppt_file = null where session_id = v_sid and idx = p_idx;
  else
    select coalesce(
      (select pe.name from profiles pr join people pe on pe.id = pr.person_id where pr.uid = auth.uid()),
      '관리자') into who;
    update teams
    set ppt_file = p_file || jsonb_build_object('by', who, 'at', now())
    where session_id = v_sid and idx = p_idx;
  end if;
end $$;

create or replace function public.set_notice(p_text text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  if public.my_session() is null then raise exception 'NO_SESSION'; end if;
  update sessions set notice = coalesce(p_text, ''), notice_updated_at = now()
  where id = public.my_session();
end $$;

-- ---------------- 평가 ----------------
create or replace function public.set_eval_open(p_open boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  if public.my_session() is null then raise exception 'NO_SESSION'; end if;
  update sessions set eval_open = coalesce(p_open, false) where id = public.my_session();
end $$;

-- 평가는 점수/피드백을 따로 제출 (같은 행에 병합 저장, 둘 다 비면 행 삭제)
-- 팀원: 자기 팀 제외. 점수는 eval_open일 때만, 피드백은 상시. 관리자: 제한 없음.
drop function if exists public.submit_evaluation(int, int, text);  -- 구버전 통합 함수 제거

-- 공용 검증: 평가자 정보 반환 (관리자는 person null / uid, 팀원은 person / from_team)
create or replace function public._eval_actor(p_to_team int, out o_sid uuid, out o_open boolean,
                                              out o_person uuid, out o_from int, out o_uid uuid)
language plpgsql security definer set search_path = public as $$
declare v_cnt int;
begin
  o_sid := public.my_session();
  if o_sid is null then raise exception 'NO_SESSION'; end if;
  select team_count, eval_open into v_cnt, o_open from sessions where id = o_sid;
  if p_to_team is null or p_to_team < 0 or p_to_team >= v_cnt then raise exception 'BAD_TEAM'; end if;
  if public.is_admin() then
    o_uid := auth.uid(); o_person := null; o_from := null;
  else
    select pr.person_id, pe.team into o_person, o_from
    from profiles pr join people pe on pe.id = pr.person_id
    where pr.uid = auth.uid() and pr.role = 'member' and pr.session_id = o_sid;
    if o_person is null then raise exception 'NOT_ALLOWED'; end if;
    if o_from is null then raise exception 'NO_TEAM'; end if;
    if o_from = p_to_team then raise exception 'OWN_TEAM'; end if;
  end if;
end $$;
revoke execute on function public._eval_actor(int) from anon, authenticated;  -- 내부 전용

create or replace function public.submit_eval_score(p_to_team int, p_score int) returns void
language plpgsql security definer set search_path = public as $$
declare a record;
begin
  select * into a from public._eval_actor(p_to_team);
  if p_score is not null and (p_score < 1 or p_score > 10) then raise exception 'BAD_SCORE'; end if;
  if a.o_person is not null and not a.o_open then raise exception 'EVAL_CLOSED'; end if;
  if a.o_person is not null then
    insert into evaluations (session_id, to_team, from_team, evaluator_person, score)
    values (a.o_sid, p_to_team, a.o_from, a.o_person, p_score)
    on conflict (session_id, evaluator_person, to_team) where evaluator_person is not null
    do update set score = excluded.score, from_team = excluded.from_team, updated_at = now();
  else
    insert into evaluations (session_id, to_team, evaluator_uid, score)
    values (a.o_sid, p_to_team, a.o_uid, p_score)
    on conflict (session_id, evaluator_uid, to_team) where evaluator_uid is not null
    do update set score = excluded.score, updated_at = now();
  end if;
  delete from evaluations
  where session_id = a.o_sid and to_team = p_to_team and score is null and trim(comment) = ''
    and (evaluator_person = a.o_person or evaluator_uid = a.o_uid);
end $$;

create or replace function public.submit_eval_comment(p_to_team int, p_comment text) returns void
language plpgsql security definer set search_path = public as $$
declare a record; v_comment text;
begin
  select * into a from public._eval_actor(p_to_team);
  v_comment := trim(coalesce(p_comment, ''));
  if a.o_person is not null then
    insert into evaluations (session_id, to_team, from_team, evaluator_person, comment)
    values (a.o_sid, p_to_team, a.o_from, a.o_person, v_comment)
    on conflict (session_id, evaluator_person, to_team) where evaluator_person is not null
    do update set comment = excluded.comment, from_team = excluded.from_team, updated_at = now();
  else
    insert into evaluations (session_id, to_team, evaluator_uid, comment)
    values (a.o_sid, p_to_team, a.o_uid, v_comment)
    on conflict (session_id, evaluator_uid, to_team) where evaluator_uid is not null
    do update set comment = excluded.comment, updated_at = now();
  end if;
  delete from evaluations
  where session_id = a.o_sid and to_team = p_to_team and score is null and trim(comment) = ''
    and (evaluator_person = a.o_person or evaluator_uid = a.o_uid);
end $$;

-- 주관식 피드백은 같은 세션 누구나 열람 가능 (점수·작성자는 계속 비공개)
-- security definer 뷰: evaluations의 RLS를 우회하되 comment만, 본인 세션 것만 노출
drop view if exists public.team_feedback;
create view public.team_feedback with (security_barrier) as
  select session_id, to_team, comment, updated_at
  from public.evaluations
  where trim(comment) <> '' and session_id = public.my_session();
grant select on public.team_feedback to anon, authenticated;

-- ---------------- Storage (PPT 파일) ----------------
insert into storage.buckets (id, name, public) values ('ppt', 'ppt', true)
on conflict (id) do nothing;

drop policy if exists ppt_read on storage.objects;
create policy ppt_read on storage.objects for select using (bucket_id = 'ppt');

drop policy if exists ppt_insert on storage.objects;
create policy ppt_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'ppt' and public.can_edit_team_object(name));

drop policy if exists ppt_update on storage.objects;
create policy ppt_update on storage.objects for update to authenticated
  using (bucket_id = 'ppt' and public.can_edit_team_object(name));

drop policy if exists ppt_delete on storage.objects;
create policy ppt_delete on storage.objects for delete to authenticated
  using (bucket_id = 'ppt' and public.can_edit_team_object(name));

-- ---------------- 초기 데이터 ----------------
insert into public.settings (id) values (1) on conflict (id) do nothing;
insert into public.private_settings (id) values (1) on conflict (id) do nothing;

-- 세션(교육)은 앱의 관리자 모드에서 [＋새 교육]으로 만드세요.
-- 명단은 관리자 모드 → 왼쪽 사이드바에서 엑셀(.xlsx)을 업로드해 등록하세요.
