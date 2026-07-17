// 라이브 콘솔 — 발표 순서/진행 제어/타이머/평가 오픈/프로젝터/퀴즈 빠른 발사
import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  closeQuiz, openQuiz, setEvalOpen, setPresentOrder, setPresentStage, setTimer, shufflePresentOrder,
} from '@/api';
import { orderedTeams, useEvaluations, useJudges, useQuizzes } from '@/hooks/useData';
import { useProfile } from '@/hooks/useProfile';
import { useSessionData } from '@/hooks/useSessionData';
import { toast } from '@/hooks/useStore';
import { errMsg } from '@/lib/errors';
import { teamColor } from '@/lib/format';
import { Badge, Button, Dot, EmptyState, SectionHead } from '@/components/ui';
import type { SessionRow } from '@/types/domain';
import './adminlive.css';

function fmtClock(sec: number): string {
  const neg = sec < 0;
  const a = Math.floor(Math.abs(sec));
  return `${neg ? '-' : ''}${Math.floor(a / 60)}:${String(a % 60).padStart(2, '0')}`;
}

/** 1초 tick — active일 때만 인터벌 가동 */
function useNowTick(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

const STAGES: [SessionRow['present_stage'], string][] = [
  ['idle', '대기'], ['order', '발표 순서'], ['live', '발표 중'], ['leaderboard', '리더보드'],
];

export default function LiveConsolePage() {
  const { data, isLoading } = useProfile();
  const session = data?.session ?? null;
  if (isLoading) return <EmptyState>불러오는 중…</EmptyState>;
  if (!session) return <EmptyState>세션에 입장한 뒤 이용할 수 있습니다.</EmptyState>;
  return <Console session={session} />;
}

function Console({ session }: { session: SessionRow }) {
  const sid = session.id;
  const indiv = session.team_count === 0;
  const qc = useQueryClient();
  const { data: sd } = useSessionData(session);
  const teams = sd?.teams ?? [];
  const people = sd?.people ?? [];
  const evals = useEvaluations(sid, true).data ?? [];
  const judges = useJudges(sid).data ?? [];
  const quizzes = useQuizzes(sid).data ?? [];
  const liveQuiz = quizzes.find((q) => q.status === 'open');
  const now = useNowTick(session.timer_started_at != null || liveQuiz != null);

  const act = async (fn: () => Promise<unknown>, keys: unknown[][]) => {
    try {
      await fn();
      await Promise.all(keys.map((k) => qc.invalidateQueries({ queryKey: k })));
    } catch (e) {
      toast(errMsg(e), 'error');
    }
  };

  /* ---------- 발표 순서 편집 ---------- */
  const serverKeys = useMemo(() => {
    if (indiv) {
      const assigned = orderedTeams(people).map((p) => p.id);
      const rest = people.filter((p) => p.present_order == null).map((p) => p.id);
      return [...assigned, ...rest];
    }
    const assigned = orderedTeams(teams).map((t) => String(t.idx));
    const rest = teams.filter((t) => t.present_order == null).map((t) => String(t.idx));
    return [...assigned, ...rest];
  }, [indiv, people, teams]);
  const assignedKeys = useMemo(
    () => new Set(indiv
      ? people.filter((p) => p.present_order != null).map((p) => p.id)
      : teams.filter((t) => t.present_order != null).map((t) => String(t.idx))),
    [indiv, people, teams],
  );

  const [localOrder, setLocalOrder] = useState<string[] | null>(null);
  const [savingOrder, setSavingOrder] = useState(false);
  const shownOrder = localOrder ?? serverKeys;

  const keyLabel = (key: string) => {
    if (indiv) return people.find((p) => p.id === key)?.name ?? '(명단에 없음)';
    const idx = Number(key);
    return teams.find((t) => t.idx === idx)?.name ?? `팀 ${idx + 1}`;
  };

  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= shownOrder.length) return;
    const next = shownOrder.slice();
    [next[i], next[j]] = [next[j], next[i]];
    setLocalOrder(next);
  };

  const saveOrder = async () => {
    setSavingOrder(true);
    try {
      if (indiv) await setPresentOrder(null, shownOrder);
      else await setPresentOrder(shownOrder.map(Number), null);
      setLocalOrder(null);
      await qc.invalidateQueries({ queryKey: ['sessionData', sid] });
      toast('발표 순서를 저장했습니다', 'success');
    } catch (e) {
      toast(errMsg(e), 'error');
    } finally {
      setSavingOrder(false);
    }
  };

  const shuffle = () => act(async () => {
    await shufflePresentOrder();
    setLocalOrder(null);
    toast('랜덤으로 추첨했습니다', 'success');
  }, [['sessionData', sid]]);

  /* ---------- 진행 제어 ---------- */
  const cur = session.current_present;
  const liveList = useMemo(() => serverKeys.filter((k) => assignedKeys.has(k)), [serverKeys, assignedKeys]);
  const curKey = cur != null ? liveList[cur] : undefined;
  const goto = (i: number) => act(() => setPresentStage('live', i), [['profile']]);

  const itemStatus = (pos: number, key: string): 'none' | 'done' | 'current' | 'wait' => {
    if (!assignedKeys.has(key)) return 'none';
    if (localOrder != null || cur == null) return 'wait';
    if (pos < cur) return 'done';
    if (pos === cur) return 'current';
    return 'wait';
  };

  /* ---------- 타이머 ---------- */
  const startedAt = session.timer_started_at;
  const running = startedAt != null;
  const remain = running
    ? session.timer_seconds - (now - new Date(startedAt).getTime()) / 1000
    : session.timer_seconds;
  const minuteOpts = [300, 600, 900, 1200];

  /* ---------- 평가 제출 현황 ---------- */
  const judgeDone = new Set(evals.filter((e) => e.evaluator_judge != null && e.score != null).map((e) => e.evaluator_judge)).size;
  const studentDone = new Set(evals.filter((e) => e.evaluator_person != null && e.score != null).map((e) => e.evaluator_person)).size;
  const studentTotal = indiv ? people.length : people.filter((p) => p.team != null).length;

  /* ---------- 퀴즈 빠른 발사 ---------- */
  const drafts = quizzes.filter((q) => q.status === 'draft');
  const [draftSel, setDraftSel] = useState('');
  const fireId = drafts.some((q) => q.id === draftSel) ? draftSel : drafts[0]?.id;
  const quizRemain = liveQuiz?.closes_at
    ? Math.max(0, Math.ceil((new Date(liveQuiz.closes_at).getTime() - now) / 1000))
    : 0;

  return (
    <div className="al-page">
      <SectionHead
        title="라이브 콘솔"
        sub={session.name}
        right={session.present_stage === 'live' ? <Badge tone="live">발표 진행 중</Badge> : undefined}
      />
      <div className="al-grid">
        {/* 발표 순서 편집 */}
        <div className="al-card">
          <h3 className="al-card-title">발표 순서</h3>
          {shownOrder.length === 0 ? (
            <EmptyState>{indiv ? '명단에 참가자가 없습니다.' : '팀이 없습니다. 설정에서 팀 수를 정하세요.'}</EmptyState>
          ) : (
            <div className="al-order-list">
              {shownOrder.map((key, pos) => {
                const st = itemStatus(pos, key);
                return (
                  <div key={key} className={`al-order-item ${st === 'current' ? 'is-current' : ''} ${st === 'done' ? 'is-done' : ''}`}>
                    <span className="al-order-num">{pos + 1}</span>
                    <span className="al-order-name">
                      {!indiv && <Dot color={teamColor(Number(key))} />}
                      {keyLabel(key)}
                    </span>
                    {st === 'none' && <Badge>미지정</Badge>}
                    {st === 'done' && <Badge>완료</Badge>}
                    {st === 'current' && <Badge tone="live">발표 중</Badge>}
                    {st === 'wait' && <Badge>대기</Badge>}
                    <button type="button" className="al-icon-btn" aria-label="위로" disabled={pos === 0} onClick={() => move(pos, -1)}>↑</button>
                    <button type="button" className="al-icon-btn" aria-label="아래로" disabled={pos === shownOrder.length - 1} onClick={() => move(pos, 1)}>↓</button>
                  </div>
                );
              })}
            </div>
          )}
          <div className="al-row">
            <Button size="sm" onClick={shuffle}>랜덤 추첨</Button>
            <Button
              size="sm"
              variant="primary"
              disabled={shownOrder.length === 0 || (localOrder == null && assignedKeys.size === shownOrder.length)}
              loading={savingOrder}
              onClick={saveOrder}
            >
              저장
            </Button>
            {localOrder != null && <Button size="sm" variant="ghost" onClick={() => setLocalOrder(null)}>되돌리기</Button>}
          </div>
        </div>

        {/* 진행 제어 */}
        <div className="al-card">
          <h3 className="al-card-title">진행 제어</h3>
          {curKey != null ? (
            <div className="al-current">
              {!indiv && <Dot color={teamColor(Number(curKey))} />}
              <span className="al-current-name">{keyLabel(curKey)}</span>
              <span className="al-muted">{(cur ?? 0) + 1} / {liveList.length}</span>
            </div>
          ) : (
            <p className="al-muted">
              {liveList.length === 0
                ? '먼저 발표 순서를 저장하거나 랜덤 추첨하세요.'
                : '진행 중인 발표가 없습니다. [다음 발표 ▶]로 시작하세요.'}
            </p>
          )}
          <div className="al-row">
            <Button disabled={cur == null || cur <= 0} onClick={() => goto((cur ?? 0) - 1)}>◀ 이전</Button>
            <Button
              variant="primary"
              disabled={liveList.length === 0 || (cur != null && cur >= liveList.length - 1)}
              onClick={() => goto(cur == null ? 0 : cur + 1)}
            >
              다음 발표 ▶
            </Button>
          </div>
        </div>

        {/* 타이머 */}
        <div className="al-card">
          <h3 className="al-card-title">발표 타이머</h3>
          <div className="al-row">
            <div className={`al-timer ${running && remain < 0 ? 'is-over' : ''}`}>{fmtClock(remain)}</div>
            {running && remain < 0 && <Badge tone="live">시간 초과</Badge>}
            {running && remain >= 0 && <Badge tone="success">진행 중</Badge>}
          </div>
          <div className="al-row">
            <select
              className="al-select"
              aria-label="타이머 시간"
              value={String(session.timer_seconds)}
              onChange={(e) => act(() => setTimer(Number(e.target.value), null), [['profile']])}
            >
              {!minuteOpts.includes(session.timer_seconds) && (
                <option value={session.timer_seconds}>{Math.round(session.timer_seconds / 60)}분</option>
              )}
              {minuteOpts.map((s) => <option key={s} value={s}>{s / 60}분</option>)}
            </select>
            <Button variant="primary" disabled={running} onClick={() => act(() => setTimer(null, true), [['profile']])}>시작</Button>
            <Button disabled={!running} onClick={() => act(() => setTimer(null, false), [['profile']])}>정지</Button>
          </div>
        </div>

        {/* 평가 */}
        <div className="al-card">
          <h3 className="al-card-title">평가</h3>
          {indiv ? (
            <p className="al-muted">개별활동 모드에서는 팀 평가를 사용하지 않습니다.</p>
          ) : (
            <>
              <div className="al-row">
                {session.eval_open ? <Badge tone="live">평가 진행 중</Badge> : <Badge>닫힘</Badge>}
                <Button
                  size="sm"
                  variant={session.eval_open ? 'danger' : 'primary'}
                  onClick={() => act(() => setEvalOpen(!session.eval_open), [['profile']])}
                >
                  {session.eval_open ? '평가 마감하기' : '평가 열기'}
                </Button>
              </div>
              <p className="al-muted">
                제출 현황 — 심사위원 {judgeDone}/{judges.length} · 학생 {studentDone}/{studentTotal}
              </p>
            </>
          )}
        </div>

        {/* 프로젝터 */}
        <div className="al-card">
          <h3 className="al-card-title">프로젝터</h3>
          <div className="al-seg" role="radiogroup" aria-label="표시 상태">
            {STAGES.map(([s, label]) => (
              <label key={s} className={`al-seg-item ${session.present_stage === s ? 'is-on' : ''}`}>
                <input
                  type="radio"
                  name="present-stage"
                  checked={session.present_stage === s}
                  onChange={() => act(() => setPresentStage(s, s === 'live' ? (cur ?? 0) : null), [['profile']])}
                />
                {label}
              </label>
            ))}
          </div>
          <div className="al-row">
            <Button size="sm" onClick={() => window.open('/present', '_blank')}>프로젝터 뷰 열기</Button>
          </div>
        </div>

        {/* 퀴즈 빠른 발사 */}
        <div className="al-card">
          <h3 className="al-card-title">퀴즈 빠른 발사</h3>
          {liveQuiz ? (
            <div className="al-row">
              <Badge tone="live">진행 중</Badge>
              <span className="al-quiz-q">{liveQuiz.question}</span>
              <span className="al-timer-sm">남은 {quizRemain}초</span>
              <Button
                size="sm"
                variant="danger"
                onClick={() => act(() => closeQuiz(liveQuiz.id), [['quizzes', sid], ['quizAnswers', sid], ['quizPoints', sid]])}
              >
                마감
              </Button>
            </div>
          ) : drafts.length > 0 ? (
            <div className="al-row">
              <select
                className="al-select"
                aria-label="발사할 퀴즈"
                style={{ flex: 1, minWidth: 160 }}
                value={fireId}
                onChange={(e) => setDraftSel(e.target.value)}
              >
                {drafts.map((q) => <option key={q.id} value={q.id}>{q.question}</option>)}
              </select>
              <Button variant="primary" onClick={() => fireId && act(() => openQuiz(fireId), [['quizzes', sid]])}>지금 발사</Button>
            </div>
          ) : (
            <p className="al-muted">대기 중인 퀴즈가 없습니다. 퀴즈 탭에서 미리 만들어 두세요.</p>
          )}
        </div>
      </div>
    </div>
  );
}
