// 풀스크린 퀴즈 오버레이 — 학생(member) 전용. open이면 응답, closed면 정답 공개 후 자동 닫힘.
import { useEffect, useRef, useState } from 'react';
import { submitQuizAnswer } from '@/api';
import { errMsg, isErr } from '@/lib/errors';
import { toast, useStore } from '@/hooks/useStore';
import { useProfile } from '@/hooks/useProfile';
import { useQuizAnswers, useQuizzes } from '@/hooks/useData';
import { Badge } from '@/components/ui';
import '@/routes/student/student.css';

const CHOICE_LABELS = ['①', '②', '③', '④', '⑤', '⑥'];

export default function QuizOverlay() {
  const activeQuizId = useStore((s) => s.activeQuizId);
  const setActiveQuiz = useStore((s) => s.setActiveQuiz);
  const { data: prof } = useProfile();
  const role = prof?.profile?.role;
  const personId = prof?.profile?.person_id ?? null;
  const sid = role === 'member' ? prof?.session?.id : null;

  const { data: quizzes = [] } = useQuizzes(sid);
  const { data: answers = [] } = useQuizAnswers(activeQuizId ? sid : null, activeQuizId ?? undefined);

  const quiz = activeQuizId ? quizzes.find((q) => q.id === activeQuizId) ?? null : null;
  const openQuizId = quizzes.find((q) => q.status === 'open')?.id ?? null;

  const [myChoice, setMyChoice] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const dismissed = useRef<Set<string>>(new Set());

  // 새로고침 등으로 놓친 진행 중 퀴즈 자동 표시 (수동으로 닫은 퀴즈는 제외)
  useEffect(() => {
    if (role !== 'member') return;
    if (!activeQuizId && openQuizId && !dismissed.current.has(openQuizId)) {
      setActiveQuiz(openQuizId);
    }
  }, [role, activeQuizId, openQuizId, setActiveQuiz]);

  // 퀴즈가 바뀌면 로컬 응답 상태 초기화
  useEffect(() => {
    setMyChoice(null);
    setSubmitted(false);
  }, [activeQuizId]);

  // 카운트다운 (1초 간격)
  const quizOpen = quiz?.status === 'open';
  useEffect(() => {
    if (!quizOpen) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    setNow(Date.now());
    return () => clearInterval(t);
  }, [quizOpen, activeQuizId]);

  // closed가 되면 정답 공개 후 3초 뒤 자동 닫힘
  const quizClosed = quiz?.status === 'closed';
  useEffect(() => {
    if (!quizClosed || !activeQuizId) return;
    const t = setTimeout(() => setActiveQuiz(null), 3000);
    return () => clearTimeout(t);
  }, [quizClosed, activeQuizId, setActiveQuiz]);

  if (role !== 'member' || !quiz) return null;

  const myAnswer = answers.find((a) => a.quiz_id === quiz.id && a.person_id === personId) ?? null;
  const answered = submitted || myAnswer != null;
  const chosen = myAnswer?.choice_idx ?? myChoice;

  const remain = quiz.closes_at
    ? Math.max(0, Math.ceil((new Date(quiz.closes_at).getTime() - now) / 1000))
    : null;
  const timeUp = remain != null && remain <= 0;

  const submit = async (idx: number) => {
    if (answered || busy || timeUp) return;
    setBusy(true);
    setMyChoice(idx);
    try {
      await submitQuizAnswer(quiz.id, idx);
      setSubmitted(true);
    } catch (e) {
      if (isErr(e, 'ALREADY_ANSWERED')) {
        setSubmitted(true);
        toast(errMsg(e), 'info');
      } else {
        setMyChoice(null);
        toast(errMsg(e), 'error');
      }
    } finally {
      setBusy(false);
    }
  };

  const close = () => {
    if (quiz.status === 'open' && !answered) {
      toast('퀴즈를 닫았습니다 — 미응답은 0점 처리됩니다.', 'info');
    }
    dismissed.current.add(quiz.id);
    setActiveQuiz(null);
  };

  const revealed = quiz.revealed_idx;
  const correct = quizClosed && revealed != null && chosen === revealed;

  return (
    <div className="quiz-overlay" role="dialog" aria-modal="true" aria-label="퀴즈">
      <div className="quiz-inner">
        <div className="quiz-top">
          {quizOpen ? (
            remain != null ? (
              <span className={`quiz-timer ${remain <= 5 ? 'low' : ''}`}>{remain}초</span>
            ) : (
              <Badge tone="live">진행 중</Badge>
            )
          ) : (
            <Badge tone="default">마감</Badge>
          )}
          <button type="button" className="quiz-close" onClick={close} aria-label="닫기">✕</button>
        </div>

        {quizOpen && remain != null && quiz.time_limit_sec > 0 && (
          <div className="quiz-bar" aria-hidden>
            <i style={{ width: `${Math.min(100, (remain / quiz.time_limit_sec) * 100)}%` }} />
          </div>
        )}

        <h2 className="quiz-q">{quiz.question}</h2>

        <div className="quiz-choices">
          {quiz.choices.map((c, i) => {
            const cls = [
              'quiz-choice',
              chosen === i ? 'sel' : '',
              quizClosed && revealed === i ? 'correct' : '',
            ].join(' ');
            return (
              <button key={i} type="button" className={cls}
                disabled={quizClosed || answered || busy || timeUp}
                onClick={() => void submit(i)}>
                <span className="idx">{CHOICE_LABELS[i] ?? i + 1}</span>
                <span>{c}</span>
              </button>
            );
          })}
        </div>

        {quizOpen && (
          <p className="quiz-status">
            {answered
              ? '제출 완료! 결과를 기다리세요.'
              : timeUp
                ? '시간이 끝났습니다 — 결과를 기다리세요.'
                : '보기를 눌러 답을 제출하세요. 한 번만 제출할 수 있습니다.'}
          </p>
        )}

        {quizClosed && (
          <p className={`quiz-status ${chosen == null ? '' : correct ? 'ok' : 'no'}`}>
            {chosen == null
              ? '미응답 — 0점 처리되었습니다.'
              : correct
                ? '정답입니다!'
                : '아쉽지만 오답입니다.'}
          </p>
        )}
      </div>
    </div>
  );
}
