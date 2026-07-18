// 퀴즈 관리 — 만들기 폼, 목록(출제/마감/삭제 + 응답 분포), 리더보드
import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { closeQuiz, createQuiz, deleteQuiz, openQuiz } from '@/api';
import { useQuizAnswers, useQuizPoints, useQuizzes } from '@/hooks/useData';
import { useProfile } from '@/hooks/useProfile';
import { useSessionData } from '@/hooks/useSessionData';
import { toast } from '@/hooks/useStore';
import { errMsg } from '@/lib/errors';
import { teamColor } from '@/lib/format';
import { Badge, Button, ClampText, ConfirmSheet, Dot, EmptyState, SectionHead, TextArea, TextInput } from '@/components/ui';
import type { Quiz, SessionRow } from '@/types/domain';
import './adminlive.css';

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

export default function QuizAdminPage() {
  const { data, isLoading } = useProfile();
  const session = data?.session ?? null;
  if (isLoading) return <EmptyState>불러오는 중…</EmptyState>;
  if (!session) return <EmptyState>세션에 입장한 뒤 이용할 수 있습니다.</EmptyState>;
  return <QuizBody session={session} />;
}

function QuizBody({ session }: { session: SessionRow }) {
  const sid = session.id;
  const indiv = session.team_count === 0;
  const qc = useQueryClient();
  const { data: sd } = useSessionData(session);
  const teams = sd?.teams ?? [];
  const quizzes = useQuizzes(sid).data ?? [];
  const points = useQuizPoints(sid).data ?? [];
  const now = useNowTick(quizzes.some((q) => q.status === 'open'));

  const act = async (fn: () => Promise<unknown>, keys: unknown[][]) => {
    try {
      await fn();
      await Promise.all(keys.map((k) => qc.invalidateQueries({ queryKey: k })));
    } catch (e) {
      toast(errMsg(e), 'error');
    }
  };

  /* ---------- 만들기 폼 ---------- */
  const [question, setQuestion] = useState('');
  const [choices, setChoices] = useState<string[]>(['', '']);
  const [correct, setCorrect] = useState(0);
  const [timeLimit, setTimeLimit] = useState(20);
  const [basePoints, setBasePoints] = useState(10);
  const [speedBonus, setSpeedBonus] = useState(true);
  const [creating, setCreating] = useState(false);

  const removeChoice = (i: number) => {
    if (choices.length <= 2) return;
    setChoices(choices.filter((_, j) => j !== i));
    if (correct === i) setCorrect(0);
    else if (correct > i) setCorrect(correct - 1);
  };

  const create = async () => {
    const q = question.trim();
    const cs = choices.map((c) => c.trim());
    if (!q) { toast('문항을 입력하세요.', 'error'); return; }
    if (cs.some((c) => c === '')) { toast('모든 보기를 입력하세요.', 'error'); return; }
    setCreating(true);
    try {
      await createQuiz({ question: q, choices: cs, correct, timeLimit, points: basePoints, speedBonus });
      await qc.invalidateQueries({ queryKey: ['quizzes', sid] });
      setQuestion('');
      setChoices(['', '']);
      setCorrect(0);
      toast('퀴즈를 만들었습니다 (대기 상태)', 'success');
    } catch (e) {
      toast(errMsg(e), 'error');
    } finally {
      setCreating(false);
    }
  };

  /* ---------- 목록 ---------- */
  const [expanded, setExpanded] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Quiz | null>(null);
  const fire = (id: string) => act(() => openQuiz(id), [['quizzes', sid]]);
  const close = (id: string) => act(() => closeQuiz(id), [['quizzes', sid], ['quizAnswers', sid], ['quizPoints', sid]]);

  /* ---------- 리더보드 ---------- */
  const ranked = useMemo(
    () => points.slice().sort((a, b) => b.points - a.points || b.correct_count - a.correct_count),
    [points],
  );
  const teamTotals = useMemo(() => {
    const m = new Map<number, number>();
    for (const p of points) if (p.team != null) m.set(p.team, (m.get(p.team) ?? 0) + p.points);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [points]);
  const teamName = (i: number) => teams.find((t) => t.idx === i)?.name ?? `팀 ${i + 1}`;

  return (
    <div className="al-page">
      <SectionHead title="퀴즈" sub={session.name} />

      {/* 만들기 폼 */}
      <div className="al-card">
        <h3 className="al-card-title">새 퀴즈 만들기</h3>
        <TextArea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="문항을 입력하세요"
          rows={2}
        />
        <div className="al-stack">
          {choices.map((c, i) => (
            <div key={i} className="al-row">
              <label className="al-check" title="정답으로 선택">
                <input type="radio" name="quiz-correct" checked={correct === i} onChange={() => setCorrect(i)} />
              </label>
              <TextInput
                value={c}
                onChange={(e) => setChoices(choices.map((x, j) => (j === i ? e.target.value : x)))}
                placeholder={`보기 ${i + 1}`}
                style={{ flex: 1, minWidth: 150 }}
              />
              <button type="button" className="al-icon-btn" aria-label="보기 삭제" disabled={choices.length <= 2} onClick={() => removeChoice(i)}>✕</button>
            </div>
          ))}
        </div>
        <div className="al-row">
          <Button size="sm" disabled={choices.length >= 6} onClick={() => setChoices([...choices, ''])}>+ 보기 추가</Button>
          <span className="al-muted">왼쪽 라디오로 정답 선택 · 보기 {choices.length}/6</span>
        </div>
        <div className="al-row">
          <label className="al-muted">
            제한시간{' '}
            <select className="al-select" value={timeLimit} onChange={(e) => setTimeLimit(Number(e.target.value))}>
              {[10, 20, 30, 60].map((s) => <option key={s} value={s}>{s}초</option>)}
            </select>
          </label>
          <label className="al-muted">
            기본 점수{' '}
            <TextInput
              type="number"
              min={1}
              max={1000}
              value={basePoints}
              onChange={(e) => setBasePoints(Math.max(1, Number(e.target.value) || 1))}
              style={{ width: 80, display: 'inline-block' }}
            />
          </label>
          <label className="al-check">
            <input type="checkbox" checked={speedBonus} onChange={(e) => setSpeedBonus(e.target.checked)} />
            스피드 보너스
          </label>
          <span style={{ marginLeft: 'auto' }}>
            <Button variant="primary" loading={creating} onClick={create}>퀴즈 저장</Button>
          </span>
        </div>
      </div>

      {/* 목록 */}
      <SectionHead title="퀴즈 목록" sub={`${quizzes.length}개`} />
      {quizzes.length === 0 ? (
        <EmptyState>아직 퀴즈가 없습니다. 위에서 첫 퀴즈를 만들어 보세요.</EmptyState>
      ) : (
        <div className="al-stack">
          {quizzes.map((q) => {
            const remainSec = q.status === 'open' && q.closes_at
              ? Math.max(0, Math.ceil((new Date(q.closes_at).getTime() - now) / 1000))
              : null;
            return (
              <div key={q.id} className="al-quiz-item">
                <div
                  className={`al-quiz-head ${q.status !== 'draft' ? 'al-clickable-row' : ''}`}
                  onClick={() => { if (q.status !== 'draft') setExpanded(expanded === q.id ? null : q.id); }}
                >
                  {q.status === 'draft' && <Badge>대기</Badge>}
                  {q.status === 'open' && <Badge tone="live">진행 중</Badge>}
                  {q.status === 'closed' && <Badge tone="success">마감</Badge>}
                  <ClampText className="al-quiz-q" lines={2} title="퀴즈 문항" text={q.question} />
                  {remainSec != null && <span className="al-timer-sm">남은 {remainSec}초</span>}
                  {q.status === 'draft' && (
                    <Button size="sm" variant="primary" onClick={(e) => { e.stopPropagation(); void fire(q.id); }}>출제</Button>
                  )}
                  {q.status === 'open' && (
                    <Button size="sm" variant="danger" onClick={(e) => { e.stopPropagation(); void close(q.id); }}>마감</Button>
                  )}
                  {q.status !== 'open' && (
                    <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setPendingDelete(q); }}>삭제</Button>
                  )}
                </div>
                {expanded === q.id && q.status !== 'draft' && <QuizDetail sid={sid} quiz={q} />}
              </div>
            );
          })}
        </div>
      )}

      {/* 리더보드 */}
      <SectionHead title="포인트 리더보드" sub="퀴즈 정답으로 쌓인 개인 포인트" />
      {ranked.length === 0 ? (
        <EmptyState>아직 포인트를 얻은 참가자가 없습니다.</EmptyState>
      ) : (
        <>
          {!indiv && teamTotals.length > 0 && (
            <div className="al-team-cards">
              {teamTotals.map(([idx, pts]) => (
                <div key={idx} className="al-team-card">
                  <span className="al-row"><Dot color={teamColor(idx)} />{teamName(idx)}</span>
                  <span className="al-team-pts">{pts}<span className="al-muted"> pt</span></span>
                </div>
              ))}
            </div>
          )}
          <div className="al-scroll">
            <table className="al-table">
              <thead>
                <tr><th>#</th><th>이름</th>{!indiv && <th>팀</th>}<th>포인트</th><th>정답 수</th></tr>
              </thead>
              <tbody>
                {ranked.map((p, i) => (
                  <tr key={p.person_id}>
                    <td className="al-rank">{i + 1}</td>
                    <td>{p.name}</td>
                    {!indiv && (
                      <td>
                        {p.team != null
                          ? <span className="al-row"><Dot color={teamColor(p.team)} />{teamName(p.team)}</span>
                          : '—'}
                      </td>
                    )}
                    <td className="al-num"><strong>{p.points}</strong></td>
                    <td className="al-num">{p.correct_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* 삭제 확인 */}
      <ConfirmSheet
        open={pendingDelete != null}
        onClose={() => setPendingDelete(null)}
        title="퀴즈 삭제"
        desc={pendingDelete ? `'${pendingDelete.question}' 퀴즈를 삭제할까요?\n응답 기록도 함께 삭제됩니다.` : undefined}
        okLabel="삭제"
        danger
        onOk={() => act(async () => {
          if (pendingDelete) await deleteQuiz(pendingDelete.id);
        }, [['quizzes', sid], ['quizAnswers', sid], ['quizPoints', sid]])}
      />
    </div>
  );
}

/** open/closed 퀴즈 응답 현황 — 응답 수/정답률/보기별 분포 */
function QuizDetail({ sid, quiz }: { sid: string; quiz: Quiz }) {
  const answers = useQuizAnswers(sid, quiz.id, quiz.status === 'open').data ?? [];
  const total = answers.length;
  const counts = quiz.choices.map((_, i) => answers.filter((a) => a.choice_idx === i).length);
  const correctCount = answers.filter((a) => a.is_correct === true).length;
  return (
    <div className="al-quiz-detail">
      <p className="al-muted">
        응답 {total}명
        {quiz.status === 'closed' && ` · 정답률 ${total ? Math.round((correctCount / total) * 100) : 0}%`}
        {quiz.status === 'open' && ' · 진행 중 (정답률은 마감 후 표시)'}
      </p>
      {quiz.choices.map((c, i) => {
        const pct = total ? Math.round((counts[i] / total) * 100) : 0;
        const isAnswer = quiz.revealed_idx === i;
        return (
          <div key={i} className="al-dist-row">
            <span className={`al-dist-label ${isAnswer ? 'is-correct' : ''}`}>
              {i + 1}. {c}{isAnswer ? ' ✓' : ''}
            </span>
            <div className="al-bar-track">
              <div className={`al-bar-fill ${isAnswer ? 'is-correct' : ''}`} style={{ width: `${pct}%` }} />
            </div>
            <span className="al-dist-count">{counts[i]}명</span>
          </div>
        );
      })}
    </div>
  );
}
