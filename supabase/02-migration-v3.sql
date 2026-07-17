-- ============================================================
-- 부트캠프 팀 보드 v3 마이그레이션 — React 전환 + 운영 기능 확장
--
-- 사용법: 01-setup-v2.sql이 이미 실행된 프로젝트에서
--         이 파일 전체를 SQL Editor에 붙여넣고 Run (여러 번 실행해도 안전)
--
-- 전부 additive: 기존 단일 HTML 앱(v2)과 새 React 앱(v3)이 동시에 동작한다.
-- 추가: 평가자(조교) 역할·평가 설정(가중치/학생 참여), 발표 순서,
--       자료 변경 이력(아카이브), 세션 채팅, 실시간 퀴즈+포인트, 관리자 DM, 공지 다건화
-- ============================================================

-- ---------------- 1. 평가자(조교) ----------------
create table if not exists public.judges (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (session_id, name)               -- 같은 이름 재입장 = 같은 평가자
);

-- 평가자 코드: 참여코드와 별개. select 정책 admin 전용 (session_codes 패턴)
create table if not exists public.session_judge_codes (
  session_id uuid primary key references public.sessions(id) on delete cascade,
  code text not null
);
create unique index if not exists judge_codes_code_uniq on public.session_judge_codes (lower(code));

alter table public.profiles add column if not exists judge_id uuid references public.judges(id) on delete set null;
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('admin', 'member', 'viewer', 'judge'));

alter table public.evaluations add column if not exists evaluator_judge uuid references public.judges(id) on delete cascade;
create unique index if not exists eval_judge_uniq on public.evaluations (session_id, evaluator_judge, to_team)
  where evaluator_judge is not null;

-- ---------------- 2. 세션 설정 컬럼 ----------------
alter table public.sessions add column if not exists student_eval_enabled boolean not null default true;
alter table public.sessions add column if not exists judge_weight int not null default 90;  -- 심사위원 %, 학생 = 100 - w
alter table public.sessions drop constraint if exists sessions_judge_weight_check;
alter table public.sessions add constraint sessions_judge_weight_check check (judge_weight between 0 and 100);
alter table public.sessions add column if not exists present_stage text not null default 'idle';  -- 프로젝터 뷰: idle|order|live|leaderboard
alter table public.sessions add column if not exists current_present int;                          -- 현재 발표 중인 순번(0-base), null=없음
alter table public.sessions add column if not exists timer_started_at timestamptz;                 -- 발표 타이머
alter table public.sessions add column if not exists timer_seconds int not null default 600;

-- ---------------- 3. 발표 순서 ----------------
alter table public.teams  add column if not exists present_order int;   -- null = 미지정
alter table public.people add column if not exists present_order int;   -- 개별 모드용

-- ---------------- 4. 자료 변경 이력 (아카이브) ----------------
create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  team_idx int,                                                     -- 팀 제출이면 idx
  person_id uuid references public.people(id) on delete set null,   -- 개별 제출이면 사람 (이력 보존)
  actor_name text not null default '',
  changes jsonb not null,                                           -- {"link":{"old":..,"new":..}, ...} 변경 필드만
  created_at timestamptz not null default now()
);
create index if not exists submissions_session_idx on public.submissions (session_id, created_at desc);

-- ---------------- 5. 세션 채팅 ----------------
create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  author_uid uuid not null,
  author_person uuid references public.people(id) on delete set null,
  author_name text not null,      -- 비정규화: realtime 페이로드 자급자족
  author_role text not null check (author_role in ('admin', 'member', 'judge')),
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists chat_session_idx on public.chat_messages (session_id, created_at desc);

-- ---------------- 6. 실시간 퀴즈 + 포인트 ----------------
-- 정답 비노출 3중 방어: (1) quizzes에 정답 컬럼 없음 (2) quiz_keys는 admin 전용 select + publication 미등록
-- (3) 채점은 close_quiz에서 일괄 (제출 즉시 채점하면 본인 is_correct로 마감 전 정답 역산 가능)
create table if not exists public.quizzes (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  question text not null,
  choices jsonb not null,                                           -- ["보기1", ...]
  time_limit_sec int not null default 20 check (time_limit_sec between 5 and 600),
  base_points int not null default 10,
  speed_bonus boolean not null default true,
  status text not null default 'draft' check (status in ('draft', 'open', 'closed')),
  opened_at timestamptz,
  closes_at timestamptz,
  revealed_idx int,                                                 -- close 시에만 채워짐 = 정답 공개 수단
  created_at timestamptz not null default now()
);

-- ⚠ 정답 금고: 어떤 경우에도 realtime publication에 등록하지 말 것 (행 전체가 페이로드로 전송됨)
create table if not exists public.quiz_keys (
  quiz_id uuid primary key references public.quizzes(id) on delete cascade,
  correct_idx int not null
);

create table if not exists public.quiz_answers (
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  session_id uuid not null references public.sessions(id) on delete cascade,
  choice_idx int not null,
  answered_at timestamptz not null default now(),
  elapsed_ms int,
  is_correct boolean,                                               -- close 시 일괄 채점
  points int not null default 0,
  primary key (quiz_id, person_id)
);
create index if not exists quiz_answers_session_idx on public.quiz_answers (session_id);

-- ---------------- 7. 관리자 DM ----------------
create table if not exists public.dm_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,   -- 스레드 키 = 학생
  from_admin boolean not null default false,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists dm_thread_idx on public.dm_messages (session_id, person_id, created_at);

-- ---------------- 8. 공지 다건화 ----------------
create table if not exists public.notices (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  body text not null,
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
create index if not exists notices_session_idx on public.notices (session_id, pinned desc, created_at desc);

-- ---------------- RLS enable (신규 테이블 — 쓰기 정책 없음 원칙 유지) ----------------
alter table public.judges enable row level security;
alter table public.session_judge_codes enable row level security;
alter table public.submissions enable row level security;
alter table public.chat_messages enable row level security;
alter table public.quizzes enable row level security;
alter table public.quiz_keys enable row level security;
alter table public.quiz_answers enable row level security;
alter table public.dm_messages enable row level security;
alter table public.notices enable row level security;

-- ---------------- 헬퍼 ----------------
create or replace function public.my_judge() returns uuid
language sql stable security definer set search_path = public as $$
  select judge_id from public.profiles where uid = auth.uid() and role = 'judge';
$$;

-- 현재 사용자 표시 이름: 팀원 → 이름, 조교 → 이름, 관리자 → '관리자'
create or replace function public._actor_name() returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select pe.name from public.profiles pr join public.people pe on pe.id = pr.person_id where pr.uid = auth.uid()),
    (select j.name from public.profiles pr join public.judges j on j.id = pr.judge_id where pr.uid = auth.uid()),
    case when public.is_admin() then '관리자' end,
    '');
$$;
revoke execute on function public._actor_name() from anon, authenticated;  -- 내부 전용

-- ---------------- 뷰 ----------------
-- people_view 재생성: present_order 노출 (drop 시 grant 소실 → 재부여 필수)
drop view if exists public.people_view;
create view public.people_view with (security_barrier) as
  select id, session_id, name, dept,
         case when public.is_admin() then student_no else '' end as student_no,
         work_link, work_memo,
         team, pin, present_order, created_at
  from public.people
  where public.is_admin() or session_id = public.my_session();
grant select on public.people_view to anon, authenticated;

-- 퀴즈 리더보드: 마감된 퀴즈만 집계 (개인 합산; 팀 합산은 클라이언트)
drop view if exists public.quiz_points;
create view public.quiz_points with (security_barrier) as
  select a.session_id, a.person_id, p.name, p.team,
         sum(a.points)::int as points,
         (count(*) filter (where a.is_correct))::int as correct_count
  from public.quiz_answers a
  join public.quizzes q on q.id = a.quiz_id and q.status = 'closed'
  join public.people p on p.id = a.person_id
  where public.is_admin() or a.session_id = public.my_session()
  group by a.session_id, a.person_id, p.name, p.team;
grant select on public.quiz_points to anon, authenticated;

-- ---------------- select 정책 ----------------
drop policy if exists judges_read on public.judges;
create policy judges_read on public.judges for select
  using (public.is_admin() or session_id = public.my_session());

drop policy if exists judge_codes_read on public.session_judge_codes;
create policy judge_codes_read on public.session_judge_codes for select
  using (public.is_admin());

drop policy if exists submissions_read on public.submissions;
create policy submissions_read on public.submissions for select
  using (public.is_admin());

drop policy if exists chat_read on public.chat_messages;
create policy chat_read on public.chat_messages for select
  using (public.is_admin() or session_id = public.my_session());

-- draft 퀴즈는 학생에게 안 보임. open으로 바뀌는 순간 realtime UPDATE가 RLS를 통과 → 팝업
drop policy if exists quizzes_read on public.quizzes;
create policy quizzes_read on public.quizzes for select
  using (public.is_admin() or (session_id = public.my_session() and status <> 'draft'));

drop policy if exists quiz_keys_read on public.quiz_keys;
create policy quiz_keys_read on public.quiz_keys for select
  using (public.is_admin());

drop policy if exists quiz_answers_read on public.quiz_answers;
create policy quiz_answers_read on public.quiz_answers for select
  using (public.is_admin()
      or person_id = (select person_id from public.profiles where uid = auth.uid()));

drop policy if exists dm_read on public.dm_messages;
create policy dm_read on public.dm_messages for select
  using (public.is_admin()
      or person_id = (select person_id from public.profiles where uid = auth.uid()));

drop policy if exists notices_read on public.notices;
create policy notices_read on public.notices for select
  using (public.is_admin() or session_id = public.my_session());

-- 조교는 본인 제출 평가를 읽을 수 있어야 함 (수정용) — 기존 정책 확장
drop policy if exists eval_read on public.evaluations;
create policy eval_read on public.evaluations for select
  using (public.is_admin()
      or evaluator_uid = auth.uid()
      or (evaluator_person is not null
          and evaluator_person = (select person_id from public.profiles where uid = auth.uid()))
      or (evaluator_judge is not null and evaluator_judge = public.my_judge()));

-- ---------------- 로그인/강등 함수 갱신 (judge_id 초기화 포함) ----------------
create or replace function public.logout() returns void
language sql security definer set search_path = public as $$
  update public.profiles set role = 'viewer', person_id = null, judge_id = null where uid = auth.uid();
$$;

create or replace function public.enter_session(p_code text) returns text
language plpgsql security definer set search_path = public as $$
declare v_sid uuid; v_name text;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select sc.session_id, s.name into v_sid, v_name
  from session_codes sc join sessions s on s.id = sc.session_id
  where lower(sc.code) = lower(trim(coalesce(p_code, ''))) and trim(coalesce(p_code, '')) <> '';
  if v_sid is null then raise exception 'BAD_CODE'; end if;
  -- 참여코드 입장 = 학생 입구: 관리자/조교 세션이어도 둘러보기로 강등, 같은 세션 팀원은 유지
  insert into profiles (uid, role, person_id, session_id) values (auth.uid(), 'viewer', null, v_sid)
  on conflict (uid) do update set
    session_id = v_sid,
    judge_id = null,
    role = case when profiles.role = 'member' and profiles.session_id = v_sid then 'member' else 'viewer' end,
    person_id = case when profiles.role = 'member' and profiles.session_id = v_sid then profiles.person_id else null end;
  return v_name;
end $$;

create or replace function public.member_enter(p_name text, p_student_no text, p_code text, p_register boolean default false) returns uuid
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

  select * into per from people
  where session_id = v_sid and student_no = v_sno
  order by created_at limit 1;
  if found then
    if per.name <> v_name and per.name not like v_name || '(%' then raise exception 'BAD_MATCH'; end if;
  else
    if exists (select 1 from people where session_id = v_sid and name = v_name and student_no = '') then
      raise exception 'NO_SNO_SET';
    end if;
    if exists (select 1 from people where session_id = v_sid and name = v_name) then
      raise exception 'BAD_MATCH';
    end if;
    if not (select allow_register from sessions where id = v_sid) then raise exception 'REG_CLOSED'; end if;
    if not coalesce(p_register, false) then raise exception 'CONFIRM_NEW'; end if;
    insert into people (session_id, name, dept, student_no) values (v_sid, v_name, '', v_sno)
    returning * into per;
  end if;

  insert into profiles (uid, role, person_id, session_id) values (auth.uid(), 'member', per.id, v_sid)
  on conflict (uid) do update set role = 'member', person_id = per.id, session_id = v_sid, judge_id = null;
  return per.id;
end $$;

-- 평가자(조교) 입장: 평가자 코드 + 이름 (같은 이름 재입장 = 같은 평가자)
create or replace function public.judge_enter(p_code text, p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_sid uuid; v_name text; v_jid uuid;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select session_id into v_sid from session_judge_codes
  where lower(code) = lower(trim(coalesce(p_code, ''))) and trim(coalesce(p_code, '')) <> '';
  if v_sid is null then raise exception 'BAD_CODE'; end if;
  v_name := trim(coalesce(p_name, ''));
  if v_name = '' then raise exception 'NO_NAME'; end if;
  insert into judges (session_id, name) values (v_sid, v_name)
  on conflict (session_id, name) do update set name = excluded.name
  returning id into v_jid;
  insert into profiles (uid, role, person_id, session_id, judge_id)
  values (auth.uid(), 'judge', null, v_sid, v_jid)
  on conflict (uid) do update set role = 'judge', person_id = null, session_id = v_sid, judge_id = v_jid;
  return v_jid;
end $$;

-- ---------------- 세션 관리 RPC (평가자 코드/설정/발표 진행) ----------------
create or replace function public.set_judge_code(p_code text) returns void
language plpgsql security definer set search_path = public as $$
declare v_sid uuid;
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  v_sid := public.my_session();
  if v_sid is null then raise exception 'NO_SESSION'; end if;
  if trim(coalesce(p_code, '')) = '' then
    delete from session_judge_codes where session_id = v_sid;
    return;
  end if;
  -- 참여코드와 교차 중복 금지 (학생이 조교로 입장하는 사고 방지)
  if exists (select 1 from session_codes where lower(code) = lower(trim(p_code))) then
    raise exception 'CODE_TAKEN';
  end if;
  begin
    insert into session_judge_codes (session_id, code) values (v_sid, trim(p_code))
    on conflict (session_id) do update set code = excluded.code;
  exception when unique_violation then
    raise exception 'CODE_TAKEN';
  end;
end $$;

-- 참여코드 설정도 평가자 코드와 교차 중복 검사하도록 교체
create or replace function public.set_session_code(p_code text) returns void
language plpgsql security definer set search_path = public as $$
declare v_sid uuid;
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  v_sid := public.my_session();
  if v_sid is null then raise exception 'NO_SESSION'; end if;
  if trim(coalesce(p_code, '')) = '' then raise exception 'EMPTY_CODE'; end if;
  if exists (select 1 from session_judge_codes where lower(code) = lower(trim(p_code))) then
    raise exception 'CODE_TAKEN';
  end if;
  begin
    insert into session_codes (session_id, code) values (v_sid, trim(p_code))
    on conflict (session_id) do update set code = excluded.code;
  exception when unique_violation then
    raise exception 'CODE_TAKEN';
  end;
end $$;

create or replace function public.remove_judge(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  delete from judges where id = p_id and session_id = public.my_session();  -- 평가도 cascade 삭제
end $$;

create or replace function public.set_eval_config(p_student_enabled boolean, p_judge_weight int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  if public.my_session() is null then raise exception 'NO_SESSION'; end if;
  if p_judge_weight is null or p_judge_weight < 0 or p_judge_weight > 100 then raise exception 'BAD_WEIGHT'; end if;
  update sessions
  set student_eval_enabled = coalesce(p_student_enabled, true), judge_weight = p_judge_weight
  where id = public.my_session();
end $$;

-- 발표 순서: 배열 순서 = 발표 순서. null/빈 배열이면 초기화
create or replace function public.set_present_order(p_team_order int[] default null, p_person_order uuid[] default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_sid uuid; i int;
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  v_sid := public.my_session();
  if v_sid is null then raise exception 'NO_SESSION'; end if;
  if p_team_order is not null then
    update teams set present_order = null where session_id = v_sid;
    for i in 1 .. coalesce(array_length(p_team_order, 1), 0) loop
      update teams set present_order = i - 1 where session_id = v_sid and idx = p_team_order[i];
    end loop;
  end if;
  if p_person_order is not null then
    update people set present_order = null where session_id = v_sid;
    for i in 1 .. coalesce(array_length(p_person_order, 1), 0) loop
      update people set present_order = i - 1 where session_id = v_sid and id = p_person_order[i];
    end loop;
  end if;
end $$;

create or replace function public.shuffle_present_order() returns void
language plpgsql security definer set search_path = public as $$
declare v_sid uuid; v_cnt int; rec record; i int := 0;
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  v_sid := public.my_session();
  if v_sid is null then raise exception 'NO_SESSION'; end if;
  select team_count into v_cnt from sessions where id = v_sid;
  if v_cnt = 0 then
    for rec in select id from people where session_id = v_sid order by random() loop
      update people set present_order = i where id = rec.id;
      i := i + 1;
    end loop;
  else
    for rec in select idx from teams where session_id = v_sid and idx < v_cnt order by random() loop
      update teams set present_order = i where session_id = v_sid and idx = rec.idx;
      i := i + 1;
    end loop;
  end if;
end $$;

-- 발표 진행 제어 (라이브 콘솔 → 프로젝터/학생 화면)
create or replace function public.set_present_stage(p_stage text, p_current int default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  if public.my_session() is null then raise exception 'NO_SESSION'; end if;
  if p_stage not in ('idle', 'order', 'live', 'leaderboard') then raise exception 'BAD_STAGE'; end if;
  update sessions set present_stage = p_stage, current_present = p_current where id = public.my_session();
end $$;

create or replace function public.set_timer(p_seconds int default null, p_running boolean default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  if public.my_session() is null then raise exception 'NO_SESSION'; end if;
  update sessions set
    timer_seconds = coalesce(p_seconds, timer_seconds),
    timer_started_at = case when p_running is true then now() when p_running is false then null else timer_started_at end
  where id = public.my_session();
end $$;

-- ---------------- 평가 함수 재생성 (judge 지원 + 학생 참여 설정) ----------------
-- out 파라미터가 늘어나 create or replace 불가 → drop 후 재생성 (사이에 다른 문장 금지)
drop function if exists public._eval_actor(int);
create function public._eval_actor(p_to_team int, out o_sid uuid, out o_open boolean,
                                   out o_person uuid, out o_from int, out o_uid uuid, out o_judge uuid)
language plpgsql security definer set search_path = public as $$
declare v_cnt int; v_student_on boolean;
begin
  o_sid := public.my_session();
  if o_sid is null then raise exception 'NO_SESSION'; end if;
  select team_count, eval_open, student_eval_enabled into v_cnt, o_open, v_student_on from sessions where id = o_sid;
  if p_to_team is null or p_to_team < 0 or p_to_team >= v_cnt then raise exception 'BAD_TEAM'; end if;
  if public.is_admin() then
    o_uid := auth.uid(); o_person := null; o_from := null; o_judge := null;
  elsif public.my_judge() is not null then
    o_judge := public.my_judge(); o_person := null; o_from := null; o_uid := null;  -- 조교: eval_open 비적용
  else
    select pr.person_id, pe.team into o_person, o_from
    from profiles pr join people pe on pe.id = pr.person_id
    where pr.uid = auth.uid() and pr.role = 'member' and pr.session_id = o_sid;
    if o_person is null then raise exception 'NOT_ALLOWED'; end if;
    if not coalesce(v_student_on, true) then raise exception 'STUDENT_EVAL_OFF'; end if;
    if o_from is null then raise exception 'NO_TEAM'; end if;
    if o_from = p_to_team then raise exception 'OWN_TEAM'; end if;
  end if;
end $$;
revoke execute on function public._eval_actor(int) from anon, authenticated;

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
  elsif a.o_judge is not null then
    insert into evaluations (session_id, to_team, evaluator_judge, score)
    values (a.o_sid, p_to_team, a.o_judge, p_score)
    on conflict (session_id, evaluator_judge, to_team) where evaluator_judge is not null
    do update set score = excluded.score, updated_at = now();
  else
    insert into evaluations (session_id, to_team, evaluator_uid, score)
    values (a.o_sid, p_to_team, a.o_uid, p_score)
    on conflict (session_id, evaluator_uid, to_team) where evaluator_uid is not null
    do update set score = excluded.score, updated_at = now();
  end if;
  delete from evaluations
  where session_id = a.o_sid and to_team = p_to_team and score is null and trim(comment) = ''
    and (evaluator_person = a.o_person or evaluator_uid = a.o_uid or evaluator_judge = a.o_judge);
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
  elsif a.o_judge is not null then
    insert into evaluations (session_id, to_team, evaluator_judge, comment)
    values (a.o_sid, p_to_team, a.o_judge, v_comment)
    on conflict (session_id, evaluator_judge, to_team) where evaluator_judge is not null
    do update set comment = excluded.comment, updated_at = now();
  else
    insert into evaluations (session_id, to_team, evaluator_uid, comment)
    values (a.o_sid, p_to_team, a.o_uid, v_comment)
    on conflict (session_id, evaluator_uid, to_team) where evaluator_uid is not null
    do update set comment = excluded.comment, updated_at = now();
  end if;
  delete from evaluations
  where session_id = a.o_sid and to_team = p_to_team and score is null and trim(comment) = ''
    and (evaluator_person = a.o_person or evaluator_uid = a.o_uid or evaluator_judge = a.o_judge);
end $$;

-- ---------------- 자료 이력 트리거 ----------------
create or replace function public._log_team_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare ch jsonb := '{}'::jsonb;
begin
  if old.ppt is distinct from new.ppt then ch := ch || jsonb_build_object('ppt', jsonb_build_object('old', old.ppt, 'new', new.ppt)); end if;
  if old.link is distinct from new.link then ch := ch || jsonb_build_object('link', jsonb_build_object('old', old.link, 'new', new.link)); end if;
  if old.memo is distinct from new.memo then ch := ch || jsonb_build_object('memo', jsonb_build_object('old', old.memo, 'new', new.memo)); end if;
  if old.ppt_file is distinct from new.ppt_file then ch := ch || jsonb_build_object('ppt_file', jsonb_build_object('old', old.ppt_file, 'new', new.ppt_file)); end if;
  if ch <> '{}'::jsonb then
    insert into submissions (session_id, team_idx, actor_name, changes)
    values (new.session_id, new.idx, public._actor_name(), ch);
  end if;
  return new;
end $$;
drop trigger if exists trg_log_team_change on public.teams;
create trigger trg_log_team_change
  after update on public.teams
  for each row
  when (old.ppt is distinct from new.ppt or old.link is distinct from new.link
     or old.memo is distinct from new.memo or old.ppt_file is distinct from new.ppt_file)
  execute function public._log_team_change();

create or replace function public._log_person_work_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare ch jsonb := '{}'::jsonb;
begin
  if old.work_link is distinct from new.work_link then ch := ch || jsonb_build_object('work_link', jsonb_build_object('old', old.work_link, 'new', new.work_link)); end if;
  if old.work_memo is distinct from new.work_memo then ch := ch || jsonb_build_object('work_memo', jsonb_build_object('old', old.work_memo, 'new', new.work_memo)); end if;
  if ch <> '{}'::jsonb then
    insert into submissions (session_id, person_id, actor_name, changes)
    values (new.session_id, new.id, public._actor_name(), ch);
  end if;
  return new;
end $$;
drop trigger if exists trg_log_person_work_change on public.people;
create trigger trg_log_person_work_change
  after update on public.people
  for each row
  when (old.work_link is distinct from new.work_link or old.work_memo is distinct from new.work_memo)
  execute function public._log_person_work_change();

-- set_team_file 교체: 버전 경로 지원 (경로 접두사 서버 검증)
create or replace function public.set_team_file(p_idx int, p_file jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare who text; v_sid uuid; v_path text;
begin
  v_sid := public.my_session();
  if v_sid is null then raise exception 'NO_SESSION'; end if;
  if not (public.is_admin() or public.my_team() = p_idx) then raise exception 'NOT_ALLOWED'; end if;
  if p_file is null then
    update teams set ppt_file = null where session_id = v_sid and idx = p_idx;
  else
    v_path := p_file->>'path';
    if v_path is not null and v_path not like v_sid || '/team-' || p_idx || '/%' then
      raise exception 'BAD_PATH';  -- 타 팀/타 세션 경로 위조 방지
    end if;
    who := public._actor_name();
    update teams
    set ppt_file = p_file || jsonb_build_object('by', case when who = '' then '관리자' else who end, 'at', now())
    where session_id = v_sid and idx = p_idx;
  end if;
end $$;

-- ---------------- 채팅 RPC ----------------
create or replace function public.send_chat(p_body text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_sid uuid; v_role text; v_person uuid; v_name text; v_id uuid; v_body text;
begin
  v_sid := public.my_session();
  if v_sid is null then raise exception 'NO_SESSION'; end if;
  select role, person_id into v_role, v_person from profiles where uid = auth.uid();
  if v_role not in ('admin', 'member', 'judge') then raise exception 'NOT_ALLOWED'; end if;
  v_body := trim(coalesce(p_body, ''));
  if v_body = '' or char_length(v_body) > 2000 then raise exception 'BAD_BODY'; end if;
  v_name := public._actor_name();
  insert into chat_messages (session_id, author_uid, author_person, author_name, author_role, body)
  values (v_sid, auth.uid(), v_person, case when v_name = '' then '관리자' else v_name end, v_role, v_body)
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.delete_chat_message(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from chat_messages
  where id = p_id and (public.is_admin() or author_uid = auth.uid());
end $$;

-- ---------------- 퀴즈 RPC ----------------
create or replace function public.create_quiz(p_question text, p_choices jsonb, p_correct int,
                                              p_time_limit int default 20, p_points int default 10,
                                              p_speed_bonus boolean default true) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_sid uuid; v_id uuid; v_n int;
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  v_sid := public.my_session();
  if v_sid is null then raise exception 'NO_SESSION'; end if;
  if trim(coalesce(p_question, '')) = '' then raise exception 'BAD_QUESTION'; end if;
  v_n := coalesce(jsonb_array_length(p_choices), 0);
  if v_n < 2 or v_n > 6 then raise exception 'BAD_CHOICES'; end if;
  if p_correct is null or p_correct < 0 or p_correct >= v_n then raise exception 'BAD_CORRECT'; end if;
  insert into quizzes (session_id, question, choices, time_limit_sec, base_points, speed_bonus)
  values (v_sid, trim(p_question), p_choices, coalesce(p_time_limit, 20), coalesce(p_points, 10), coalesce(p_speed_bonus, true))
  returning id into v_id;
  insert into quiz_keys (quiz_id, correct_idx) values (v_id, p_correct);
  return v_id;
end $$;

create or replace function public.open_quiz(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_sid uuid; q record;
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  v_sid := public.my_session();
  select * into q from quizzes where id = p_id and session_id = v_sid;
  if not found then raise exception 'NO_QUIZ'; end if;
  if q.status <> 'draft' then raise exception 'ALREADY_OPENED'; end if;
  -- 같은 세션의 잔류 open 퀴즈 자동 마감 (관리자 이탈 대비)
  perform public.close_quiz(id) from quizzes where session_id = v_sid and status = 'open';
  update quizzes
  set status = 'open', opened_at = now(), closes_at = now() + make_interval(secs => time_limit_sec)
  where id = p_id;
end $$;

create or replace function public.close_quiz(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_sid uuid; q record; v_correct int;
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  v_sid := public.my_session();
  select * into q from quizzes where id = p_id and session_id = v_sid;
  if not found then raise exception 'NO_QUIZ'; end if;
  if q.status <> 'open' then return; end if;   -- 멱등
  select correct_idx into v_correct from quiz_keys where quiz_id = p_id;
  -- 일괄 채점: 정답이면 base + (speed_bonus ? base × 남은시간비율 : 0) — 최대 2배
  update quiz_answers a
  set is_correct = (a.choice_idx = v_correct),
      points = case when a.choice_idx = v_correct then
        q.base_points + case when q.speed_bonus then
          greatest(0, round(q.base_points * (1.0 - least(1.0, coalesce(a.elapsed_ms, 0) / (q.time_limit_sec * 1000.0)))))::int
        else 0 end
      else 0 end
  where a.quiz_id = p_id;
  update quizzes set status = 'closed', revealed_idx = v_correct where id = p_id;
end $$;

create or replace function public.submit_quiz_answer(p_quiz uuid, p_choice int) returns void
language plpgsql security definer set search_path = public as $$
declare v_sid uuid; v_person uuid; q record;
begin
  v_sid := public.my_session();
  if v_sid is null then raise exception 'NO_SESSION'; end if;
  select person_id into v_person from profiles where uid = auth.uid() and role = 'member';
  if v_person is null then raise exception 'NOT_ALLOWED'; end if;
  select * into q from quizzes where id = p_quiz and session_id = v_sid;
  if not found then raise exception 'NO_QUIZ'; end if;
  -- 서버 시각 기준 마감 판정 (+2초 grace) — 클라이언트 타이머 불신
  if q.status <> 'open' or now() > q.closes_at + interval '2 seconds' then raise exception 'QUIZ_CLOSED'; end if;
  if p_choice is null or p_choice < 0 or p_choice >= jsonb_array_length(q.choices) then raise exception 'BAD_CHOICE'; end if;
  insert into quiz_answers (quiz_id, person_id, session_id, choice_idx, elapsed_ms)
  values (p_quiz, v_person, v_sid, p_choice, (extract(epoch from now() - q.opened_at) * 1000)::int)
  on conflict (quiz_id, person_id) do nothing;
  if not found then
    -- on conflict do nothing이면 found=false — 최초 1회 고정 (마감 전 정답 유포 시 답 변경 방지)
    if exists (select 1 from quiz_answers where quiz_id = p_quiz and person_id = v_person and choice_idx <> p_choice) then
      raise exception 'ALREADY_ANSWERED';
    end if;
  end if;
end $$;

create or replace function public.delete_quiz(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  delete from quizzes where id = p_id and session_id = public.my_session();
end $$;

-- ---------------- DM RPC ----------------
create or replace function public.send_dm(p_body text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_sid uuid; v_person uuid; v_id uuid; v_body text;
begin
  v_sid := public.my_session();
  if v_sid is null then raise exception 'NO_SESSION'; end if;
  select person_id into v_person from profiles where uid = auth.uid() and role = 'member';
  if v_person is null then raise exception 'NOT_ALLOWED'; end if;
  v_body := trim(coalesce(p_body, ''));
  if v_body = '' or char_length(v_body) > 2000 then raise exception 'BAD_BODY'; end if;
  insert into dm_messages (session_id, person_id, from_admin, body)
  values (v_sid, v_person, false, v_body)
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.admin_reply_dm(p_person uuid, p_body text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_sid uuid; v_id uuid; v_body text;
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  v_sid := public.my_session();
  if v_sid is null then raise exception 'NO_SESSION'; end if;
  if not exists (select 1 from people where id = p_person and session_id = v_sid) then raise exception 'NO_NAME'; end if;
  v_body := trim(coalesce(p_body, ''));
  if v_body = '' or char_length(v_body) > 2000 then raise exception 'BAD_BODY'; end if;
  insert into dm_messages (session_id, person_id, from_admin, body)
  values (v_sid, p_person, true, v_body)
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.mark_dm_read(p_person uuid default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_person uuid;
begin
  if public.is_admin() then
    if p_person is null then raise exception 'NO_NAME'; end if;
    update dm_messages set read_at = now()
    where session_id = public.my_session() and person_id = p_person and from_admin = false and read_at is null;
  else
    select person_id into v_person from profiles where uid = auth.uid() and role = 'member';
    if v_person is null then raise exception 'NOT_ALLOWED'; end if;
    update dm_messages set read_at = now()
    where person_id = v_person and from_admin = true and read_at is null;
  end if;
end $$;

-- ---------------- 공지 RPC + 기존 공지 이전 ----------------
create or replace function public.add_notice(p_body text, p_pinned boolean default false) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  if public.my_session() is null then raise exception 'NO_SESSION'; end if;
  if trim(coalesce(p_body, '')) = '' then raise exception 'BAD_BODY'; end if;
  insert into notices (session_id, body, pinned) values (public.my_session(), trim(p_body), coalesce(p_pinned, false))
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.update_notice(p_id uuid, p_body text, p_pinned boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  update notices set body = trim(coalesce(p_body, '')), pinned = coalesce(p_pinned, false), updated_at = now()
  where id = p_id and session_id = public.my_session() and trim(coalesce(p_body, '')) <> '';
end $$;

create or replace function public.delete_notice(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  delete from notices where id = p_id and session_id = public.my_session();
end $$;

-- 기존 sessions.notice → notices 1회 이전 (이전 후 비워 재실행 시 유령 공지 방지)
do $$ begin
  insert into public.notices (session_id, body, pinned, created_at)
  select s.id, s.notice, true, coalesce(s.notice_updated_at, now())
  from public.sessions s
  where trim(s.notice) <> ''
    and not exists (select 1 from public.notices n where n.session_id = s.id);
  update public.sessions set notice = '' where trim(notice) <> '';
end $$;

-- ---------------- Realtime publication 등록 ----------------
-- ⚠ quiz_keys / session_judge_codes / team_secrets / sessions / people / evaluations는 절대 등록 금지
do $$
declare t text;
begin
  foreach t in array array['chat_messages', 'quizzes', 'quiz_answers', 'dm_messages', 'notices'] loop
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
