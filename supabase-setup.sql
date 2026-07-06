-- ============================================================
-- 부트캠프 팀 보드 — Supabase 초기 설정 SQL
--
-- 사용법: Supabase 대시보드 → SQL Editor → New query
--         이 파일 전체를 붙여넣고 Run (여러 번 실행해도 안전)
--
-- 실행 후 반드시:
--   Authentication → Sign In / Up → "Allow anonymous sign-ins" 켜기
-- ============================================================

create extension if not exists pgcrypto;

-- ---------------- 테이블 ----------------
create table if not exists public.people (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  dept text not null default '',
  team int,
  pin int,
  created_at timestamptz not null default now()
);

create table if not exists public.teams (
  idx int primary key,
  name text not null,
  ppt text not null default '',
  link text not null default '',
  memo text not null default '',
  ppt_file jsonb
);

-- API 키는 별도 테이블: RLS로 "관리자 + 그 조 팀원"만 읽게 함
create table if not exists public.team_secrets (
  idx int primary key references public.teams(idx) on delete cascade,
  api text not null default ''
);

create table if not exists public.settings (
  id int primary key check (id = 1),
  team_count int not null default 5,
  notice text not null default '',
  notice_updated_at timestamptz,
  access_code_required boolean not null default false,
  admin_set boolean not null default false
);

-- 비밀번호 해시 보관용: SELECT 정책이 없어 API로는 절대 읽을 수 없음
create table if not exists public.private_settings (
  id int primary key check (id = 1),
  admin_hash text,
  access_code_hash text
);

-- 익명 auth 사용자(uid) ↔ 역할 매핑
create table if not exists public.profiles (
  uid uuid primary key,
  role text not null check (role in ('admin', 'member')),
  person_id uuid references public.people(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- ---------------- RLS ----------------
alter table public.people enable row level security;
alter table public.teams enable row level security;
alter table public.team_secrets enable row level security;
alter table public.settings enable row level security;
alter table public.private_settings enable row level security;
alter table public.profiles enable row level security;

-- 읽기: 명단/팀/설정은 공개, 프로필은 본인 것만, private_settings는 아무도 못 읽음
drop policy if exists people_read on public.people;
create policy people_read on public.people for select using (true);

drop policy if exists teams_read on public.teams;
create policy teams_read on public.teams for select using (true);

drop policy if exists settings_read on public.settings;
create policy settings_read on public.settings for select using (true);

drop policy if exists profiles_read_own on public.profiles;
create policy profiles_read_own on public.profiles for select using (uid = auth.uid());

-- 쓰기 정책은 일부러 없음: 모든 쓰기는 아래 RPC 함수(security definer)로만 가능

-- ---------------- 권한 헬퍼 ----------------
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where uid = auth.uid() and role = 'admin');
$$;

create or replace function public.my_team() returns int
language sql stable security definer set search_path = public as $$
  select pe.team
  from public.profiles pr
  join public.people pe on pe.id = pr.person_id
  where pr.uid = auth.uid() and pr.role = 'member';
$$;

-- storage 정책용: 'team-3/file' 같은 경로를 그 조 팀원/관리자만 만지게
create or replace function public.can_edit_team_object(p_name text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare t int;
begin
  t := (regexp_match(p_name, '^team-(\d+)/'))[1]::int;
  if t is null then return false; end if;
  return public.is_admin() or public.my_team() = t;
exception when others then
  return false;
end $$;

-- API 키 읽기 정책 (헬퍼 함수 정의 후에 생성)
drop policy if exists secrets_read on public.team_secrets;
create policy secrets_read on public.team_secrets for select
  using (public.is_admin() or public.my_team() = idx);

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
  on conflict (uid) do update set role = 'admin', person_id = null;
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

-- 참여코드: 설정하면 팀원 로그인 시 코드 입력 필요, 빈값이면 해제
create or replace function public.set_access_code(p_code text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  if p_code is null or p_code = '' then
    update private_settings set access_code_hash = null where id = 1;
    update settings set access_code_required = false where id = 1;
  else
    update private_settings set access_code_hash = crypt(p_code, gen_salt('bf')) where id = 1;
    update settings set access_code_required = true where id = 1;
  end if;
end $$;

create or replace function public.member_login(p_name text, p_code text default null) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare per public.people%rowtype; req boolean; h text;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select access_code_required into req from settings where id = 1;
  if req then
    select access_code_hash into h from private_settings where id = 1;
    if h is null or h <> crypt(coalesce(p_code, ''), h) then raise exception 'BAD_CODE'; end if;
  end if;
  select * into per from people where name = trim(p_name);
  if not found then raise exception 'NO_NAME'; end if;
  if per.team is null then raise exception 'NO_TEAM'; end if;
  insert into profiles (uid, role, person_id) values (auth.uid(), 'member', per.id)
  on conflict (uid) do update set role = 'member', person_id = per.id;
  return per.id;
end $$;

create or replace function public.logout() returns void
language sql security definer set search_path = public as $$
  delete from public.profiles where uid = auth.uid();
$$;

-- ---------------- 명단 (관리자) ----------------
-- 이름 기준 병합: 같은 이름은 배정/고정 유지, 새 이름 추가, 빠진 이름 제거
create or replace function public.merge_roster(p_people jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare rec record; v_total int; v_kept int; v_removed int;
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  v_total := coalesce(jsonb_array_length(p_people), 0);
  if v_total = 0 then raise exception 'EMPTY_ROSTER'; end if;

  select count(*) into v_kept from people
  where name in (select x->>'name' from jsonb_array_elements(p_people) x);

  for rec in select x->>'name' as name, coalesce(x->>'dept', '') as dept
             from jsonb_array_elements(p_people) x loop
    insert into people (name, dept) values (rec.name, rec.dept)
    on conflict (name) do update
      set dept = case when excluded.dept <> '' then excluded.dept else people.dept end;
  end loop;

  delete from people
  where name not in (select x->>'name' from jsonb_array_elements(p_people) x);
  get diagnostics v_removed = row_count;

  return jsonb_build_object('kept', v_kept, 'added', v_total - v_kept, 'removed', v_removed);
end $$;

create or replace function public.add_person(p_name text, p_dept text default '') returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  if trim(coalesce(p_name, '')) = '' then raise exception 'NO_NAME'; end if;
  insert into people (name, dept) values (trim(p_name), coalesce(p_dept, ''));
end $$;

create or replace function public.remove_person(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  delete from people where id = p_id;
end $$;

create or replace function public.clear_people() returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  delete from people;
end $$;

-- ---------------- 배정 (관리자) ----------------
-- [{"id":"uuid","team":0,"pin":null}, ...] 형태 (team/pin은 null 가능)
create or replace function public.apply_assign(p_assign jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare x jsonb;
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  for x in select * from jsonb_array_elements(p_assign) loop
    update people
    set team = (x->>'team')::int, pin = (x->>'pin')::int
    where id = (x->>'id')::uuid;
  end loop;
end $$;

create or replace function public.reset_assign() returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  update people set team = null, pin = null;
end $$;

create or replace function public.set_team_count(p_n int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  if p_n < 1 or p_n > 15 then raise exception 'BAD_COUNT'; end if;
  update settings set team_count = p_n where id = 1;
  update people set team = null where team >= p_n;
  update people set pin = null where pin >= p_n;
end $$;

create or replace function public.rename_team(p_idx int, p_name text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  update teams set name = coalesce(nullif(trim(p_name), ''), (p_idx + 1) || '조') where idx = p_idx;
end $$;

-- ---------------- 팀 정보 ----------------
create or replace function public.set_team_api(p_idx int, p_api text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  update team_secrets set api = coalesce(p_api, '') where idx = p_idx;
end $$;

-- ppt/link/memo: 관리자 또는 그 조 팀원만
create or replace function public.update_team_field(p_idx int, p_field text, p_value text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_field not in ('ppt', 'link', 'memo') then raise exception 'BAD_FIELD'; end if;
  if not (public.is_admin() or public.my_team() = p_idx) then raise exception 'NOT_ALLOWED'; end if;
  execute format('update public.teams set %I = $1 where idx = $2', p_field)
  using coalesce(p_value, ''), p_idx;
end $$;

-- 파일 메타 저장 (업로더/시각은 서버가 기록). p_file이 null이면 삭제
create or replace function public.set_team_file(p_idx int, p_file jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare who text;
begin
  if not (public.is_admin() or public.my_team() = p_idx) then raise exception 'NOT_ALLOWED'; end if;
  if p_file is null then
    update teams set ppt_file = null where idx = p_idx;
  else
    select coalesce(
      (select pe.name from profiles pr join people pe on pe.id = pr.person_id where pr.uid = auth.uid()),
      '관리자') into who;
    update teams
    set ppt_file = p_file || jsonb_build_object('by', who, 'at', now())
    where idx = p_idx;
  end if;
end $$;

create or replace function public.set_notice(p_text text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  update settings set notice = coalesce(p_text, ''), notice_updated_at = now() where id = 1;
end $$;

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

insert into public.teams (idx, name)
select i, (i + 1) || '조' from generate_series(0, 14) i
on conflict (idx) do nothing;

insert into public.team_secrets (idx)
select i from generate_series(0, 14) i
on conflict (idx) do nothing;

-- 명단은 앱의 관리자 모드 → 왼쪽 사이드바에서 엑셀(.xlsx)을 업로드해 등록하세요.
-- (공개 저장소에 실명 명단이 올라가지 않도록 이 SQL에는 명단 시드를 넣지 않습니다)
