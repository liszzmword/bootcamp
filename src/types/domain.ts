// 앱 도메인 타입 — DB 행 타입은 database.ts, 여기는 화면·로직용

export type Role = 'admin' | 'judge' | 'member' | 'viewer';

export interface Profile {
  role: Role;
  person_id: string | null;
  judge_id: string | null;
  session_id: string | null;
}

export interface SessionRow {
  id: string;
  name: string;
  team_count: number;
  notice: string;
  notice_updated_at: string | null;
  eval_open: boolean;
  allow_register: boolean;
  individual_open: boolean;
  student_eval_enabled: boolean;
  judge_weight: number;
  present_stage: 'idle' | 'order' | 'live' | 'leaderboard';
  current_present: number | null;
  timer_started_at: string | null;
  timer_seconds: number;
  created_at: string;
}

export interface Person {
  id: string;
  session_id: string;
  name: string;
  dept: string;
  student_no: string; // 관리자 외에는 서버가 '' 마스킹
  work_link: string;
  work_memo: string;
  team: number | null;
  pin: number | null;
  present_order: number | null;
  created_at: string;
}

export interface PptFileMeta {
  name: string;
  size: number;
  path?: string; // v3 버전 경로. 없으면 legacy `{sid}/team-{idx}/file`
  by?: string;
  at?: string;
}

export interface Team {
  session_id: string;
  idx: number;
  name: string;
  ppt: string;
  link: string;
  memo: string;
  ppt_file: PptFileMeta | null;
  present_order: number | null;
  api?: string | null; // team_secrets 병합 (권한 없으면 null)
}

export interface Judge {
  id: string;
  session_id: string;
  name: string;
  created_at: string;
}

export interface Evaluation {
  id: string;
  session_id: string;
  to_team: number;
  from_team: number | null;
  evaluator_person: string | null;
  evaluator_uid: string | null;
  evaluator_judge: string | null;
  score: number | null;
  comment: string;
  updated_at: string;
}

export interface Feedback {
  session_id: string;
  to_team: number;
  comment: string;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  session_id: string;
  author_uid: string;
  author_person: string | null;
  author_name: string;
  author_role: 'admin' | 'member' | 'judge';
  body: string;
  created_at: string;
}

export interface Quiz {
  id: string;
  session_id: string;
  question: string;
  choices: string[];
  time_limit_sec: number;
  base_points: number;
  speed_bonus: boolean;
  status: 'draft' | 'open' | 'closed';
  opened_at: string | null;
  closes_at: string | null;
  revealed_idx: number | null;
  created_at: string;
}

export interface QuizAnswer {
  quiz_id: string;
  person_id: string;
  session_id: string;
  choice_idx: number;
  answered_at: string;
  elapsed_ms: number | null;
  is_correct: boolean | null;
  points: number;
}

export interface QuizPoint {
  session_id: string;
  person_id: string;
  name: string;
  team: number | null;
  points: number;
  correct_count: number;
}

export interface DmMessage {
  id: string;
  session_id: string;
  person_id: string;
  from_admin: boolean;
  body: string;
  created_at: string;
  read_at: string | null;
}

export interface Notice {
  id: string;
  session_id: string;
  body: string;
  pinned: boolean;
  created_at: string;
  updated_at: string | null;
}

export interface Submission {
  id: string;
  session_id: string;
  team_idx: number | null;
  person_id: string | null;
  actor_name: string;
  changes: Record<string, { old: unknown; new: unknown }>;
  created_at: string;
}

/** 평가 집계 — 총점 100 = 심사위원 judge_weight% + 학생 (100-w)% */
export interface EvalStats {
  judgeAvg: number | null; // 관리자+조교 평균 (1~10)
  studentAvg: number | null;
  judgeCount: number;
  studentCount: number;
  total: number | null; // 0~100
}

export function computeEvalStats(evals: Evaluation[], toTeam: number, judgeWeight: number): EvalStats {
  const rows = evals.filter((e) => e.to_team === toTeam && e.score != null);
  const judgeRows = rows.filter((e) => e.evaluator_uid != null || e.evaluator_judge != null);
  const studentRows = rows.filter((e) => e.evaluator_person != null);
  const avg = (a: Evaluation[]) => a.reduce((s, e) => s + (e.score ?? 0), 0) / a.length;
  const judgeAvg = judgeRows.length ? avg(judgeRows) : null;
  const studentAvg = studentRows.length ? avg(studentRows) : null;
  let total: number | null = null;
  if (judgeAvg != null && studentAvg != null) {
    total = judgeAvg * judgeWeight + studentAvg * (100 - judgeWeight);
  } else if (judgeAvg != null) {
    total = judgeAvg * 100; // 학생 점수 없으면 심사위원 100%
  } else if (studentAvg != null) {
    total = studentAvg * 100;
  }
  return {
    judgeAvg,
    studentAvg,
    judgeCount: judgeRows.length,
    studentCount: studentRows.length,
    total: total == null ? null : total / 10, // (1~10)×100 → 0~100
  };
}
