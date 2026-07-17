// API 계층 — 컴포넌트는 supabase 클라이언트를 직접 호출하지 않고 이 모듈만 사용한다.
import { sb, rpc } from '@/lib/supabase';
import type {
  ChatMessage, DmMessage, Evaluation, Feedback, Judge, Notice, Person,
  Profile, PptFileMeta, Quiz, QuizAnswer, QuizPoint, SessionRow, Submission, Team,
} from '@/types/domain';

const sel = async <T>(q: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T> => {
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data as T;
};

/* ---------- 읽기 ---------- */
export const getProfile = () =>
  sel<Profile | null>(sb.from('profiles').select('role,person_id,judge_id,session_id').maybeSingle());
export const getSessions = () =>
  sel<SessionRow[]>(sb.from('sessions').select('*').order('created_at', { ascending: false }));
export const getSettings = () =>
  sel<{ admin_set: boolean }>(sb.from('settings').select('admin_set').eq('id', 1).single());
export const getPeople = () =>
  sel<Person[]>(sb.from('people_view').select('*'));
export const getTeams = () =>
  sel<Omit<Team, 'api'>[]>(sb.from('teams').select('session_id,idx,name,ppt,link,memo,ppt_file,present_order').order('idx'));
export const getSecrets = () =>
  sel<{ session_id: string; idx: number; api: string }[]>(sb.from('team_secrets').select('session_id,idx,api'));
export const getFeedback = () =>
  sel<Feedback[]>(sb.from('team_feedback').select('*').order('updated_at', { ascending: false }));
export const getEvaluations = () =>
  sel<Evaluation[]>(sb.from('evaluations').select('*'));
export const getJudges = () =>
  sel<Judge[]>(sb.from('judges').select('*').order('created_at'));
export const getNotices = () =>
  sel<Notice[]>(sb.from('notices').select('*').order('pinned', { ascending: false }).order('created_at', { ascending: false }));
export const getChat = (sessionId: string, limit = 200) =>
  sel<ChatMessage[]>(sb.from('chat_messages').select('*').eq('session_id', sessionId).order('created_at', { ascending: false }).limit(limit));
export const getQuizzes = () =>
  sel<Quiz[]>(sb.from('quizzes').select('*').order('created_at', { ascending: false }));
export const getQuizAnswers = (quizId?: string) =>
  sel<QuizAnswer[]>(quizId
    ? sb.from('quiz_answers').select('*').eq('quiz_id', quizId)
    : sb.from('quiz_answers').select('*'));
export const getQuizPoints = () =>
  sel<QuizPoint[]>(sb.from('quiz_points').select('*'));
export const getDms = () =>
  sel<DmMessage[]>(sb.from('dm_messages').select('*').order('created_at'));
export const getSubmissions = () =>
  sel<Submission[]>(sb.from('submissions').select('*').order('created_at', { ascending: false }));
export const getSessionCode = (sessionId: string) =>
  sel<{ code: string } | null>(sb.from('session_codes').select('code').eq('session_id', sessionId).maybeSingle());
export const getJudgeCode = (sessionId: string) =>
  sel<{ code: string } | null>(sb.from('session_judge_codes').select('code').eq('session_id', sessionId).maybeSingle());

/* ---------- 인증/입장 ---------- */
export const adminLogin = (password: string) => rpc('admin_login', { p_password: password });
export const changeAdminPassword = (oldPw: string, newPw: string) =>
  rpc('change_admin_password', { p_old: oldPw, p_new: newPw });
export const enterSession = (code: string) => rpc<string>('enter_session', { p_code: code });
export const memberEnter = (name: string, sno: string, code: string, register = false) =>
  rpc<string>('member_enter', { p_name: name, p_student_no: sno, p_code: code, p_register: register });
export const judgeEnter = (code: string, name: string) =>
  rpc<string>('judge_enter', { p_code: code, p_name: name });
export const logout = () => rpc('logout');

/* ---------- 세션 관리 (관리자) ---------- */
export const createSession = (name: string, code: string) =>
  rpc<string>('create_session', { p_name: name, p_code: code });
export const setAdminSession = (sessionId: string) => rpc('set_admin_session', { p_session: sessionId });
export const renameSession = (name: string) => rpc('rename_session', { p_name: name });
export const setSessionCode = (code: string) => rpc('set_session_code', { p_code: code });
export const setJudgeCode = (code: string) => rpc('set_judge_code', { p_code: code });
export const deleteSession = () => rpc('delete_session');
export const setAllowRegister = (allow: boolean) => rpc('set_allow_register', { p_allow: allow });
export const setTeamCount = (n: number) => rpc('set_team_count', { p_n: n });

/* ---------- 명단/배정 (관리자) ---------- */
export const mergeRoster = (people: { name: string; dept: string; sno: string }[]) =>
  rpc<{ kept: number; added: number; removed: number }>('merge_roster', { p_people: people });
export const addPerson = (name: string, dept = '', sno = '') =>
  rpc('add_person', { p_name: name, p_dept: dept, p_student_no: sno });
export const removePerson = (id: string) => rpc('remove_person', { p_id: id });
export const clearPeople = () => rpc('clear_people');
export const setPersonSno = (id: string, sno: string) => rpc('set_person_sno', { p_id: id, p_sno: sno });
export const applyAssign = (assign: { id: string; team: number | null; pin: number | null }[]) =>
  rpc('apply_assign', { p_assign: assign });
export const resetAssign = () => rpc('reset_assign');

/* ---------- 팀 정보 ---------- */
export const renameTeam = (idx: number, name: string) => rpc('rename_team', { p_idx: idx, p_name: name });
export const setTeamApi = (idx: number, api: string) => rpc('set_team_api', { p_idx: idx, p_api: api });
export const updateTeamField = (idx: number, field: 'ppt' | 'link' | 'memo', value: string) =>
  rpc('update_team_field', { p_idx: idx, p_field: field, p_value: value });
export const setTeamFile = (idx: number, file: PptFileMeta | null) =>
  rpc('set_team_file', { p_idx: idx, p_file: file });
export const setMyWork = (link: string, memo: string) => rpc('set_my_work', { p_link: link, p_memo: memo });

/* ---------- 발표 진행 ---------- */
export const setPresentOrder = (teamOrder: number[] | null, personOrder: string[] | null) =>
  rpc('set_present_order', { p_team_order: teamOrder, p_person_order: personOrder });
export const shufflePresentOrder = () => rpc('shuffle_present_order');
export const setPresentStage = (stage: SessionRow['present_stage'], current: number | null = null) =>
  rpc('set_present_stage', { p_stage: stage, p_current: current });
export const setTimer = (seconds: number | null, running: boolean | null) =>
  rpc('set_timer', { p_seconds: seconds, p_running: running });

/* ---------- 평가 ---------- */
export const setEvalOpen = (open: boolean) => rpc('set_eval_open', { p_open: open });
export const setEvalConfig = (studentEnabled: boolean, judgeWeight: number) =>
  rpc('set_eval_config', { p_student_enabled: studentEnabled, p_judge_weight: judgeWeight });
export const submitEvalScore = (toTeam: number, score: number | null) =>
  rpc('submit_eval_score', { p_to_team: toTeam, p_score: score });
export const submitEvalComment = (toTeam: number, comment: string) =>
  rpc('submit_eval_comment', { p_to_team: toTeam, p_comment: comment });
export const resetEvalScores = () => rpc('reset_eval_scores');
export const removeJudge = (id: string) => rpc('remove_judge', { p_id: id });

/* ---------- 공지/채팅/DM ---------- */
export const setNotice = (text: string) => rpc('set_notice', { p_text: text }); // legacy
export const addNotice = (body: string, pinned = false) => rpc<string>('add_notice', { p_body: body, p_pinned: pinned });
export const updateNotice = (id: string, body: string, pinned: boolean) =>
  rpc('update_notice', { p_id: id, p_body: body, p_pinned: pinned });
export const deleteNotice = (id: string) => rpc('delete_notice', { p_id: id });
export const sendChat = (body: string) => rpc<string>('send_chat', { p_body: body });
export const deleteChatMessage = (id: string) => rpc('delete_chat_message', { p_id: id });
export const sendDm = (body: string) => rpc<string>('send_dm', { p_body: body });
export const adminReplyDm = (personId: string, body: string) =>
  rpc<string>('admin_reply_dm', { p_person: personId, p_body: body });
export const markDmRead = (personId: string | null = null) => rpc('mark_dm_read', { p_person: personId });

/* ---------- 퀴즈 ---------- */
export const createQuiz = (q: {
  question: string; choices: string[]; correct: number;
  timeLimit?: number; points?: number; speedBonus?: boolean;
}) => rpc<string>('create_quiz', {
  p_question: q.question, p_choices: q.choices, p_correct: q.correct,
  p_time_limit: q.timeLimit ?? 20, p_points: q.points ?? 10, p_speed_bonus: q.speedBonus ?? true,
});
export const openQuiz = (id: string) => rpc('open_quiz', { p_id: id });
export const closeQuiz = (id: string) => rpc('close_quiz', { p_id: id });
export const deleteQuiz = (id: string) => rpc('delete_quiz', { p_id: id });
export const submitQuizAnswer = (quizId: string, choice: number) =>
  rpc('submit_quiz_answer', { p_quiz: quizId, p_choice: choice });

/* ---------- Storage (PPT 파일 — 버전 경로) ---------- */
const safeName = (name: string) => name.replace(/[^\w.\-가-힣]/g, '_').slice(0, 80);

export async function uploadPpt(sessionId: string, teamIdx: number, file: File): Promise<PptFileMeta> {
  const path = `${sessionId}/team-${teamIdx}/v/${Date.now()}-${safeName(file.name)}`;
  const { error } = await sb.storage.from('ppt').upload(path, file, {
    upsert: false,
    contentType: file.type || 'application/octet-stream',
  });
  if (error) throw new Error(error.message);
  const meta: PptFileMeta = { name: file.name, size: file.size, path };
  await setTeamFile(teamIdx, meta);
  return meta;
}

export function pptDownloadUrl(sessionId: string, teamIdx: number, meta: PptFileMeta): string {
  const path = meta.path || `${sessionId}/team-${teamIdx}/file`; // legacy fallback
  const { data } = sb.storage.from('ppt').getPublicUrl(path, { download: meta.name });
  return data.publicUrl + '&v=' + encodeURIComponent(meta.at || '');
}

export async function deletePpt(sessionId: string, teamIdx: number, meta: PptFileMeta | null): Promise<void> {
  const path = meta?.path || `${sessionId}/team-${teamIdx}/file`;
  await sb.storage.from('ppt').remove([path]);
  await setTeamFile(teamIdx, null);
}
