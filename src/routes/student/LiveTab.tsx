// 라이브 탭 — 발표 순서 타임라인 · 현재 발표 팀 · 학생 평가 · 퀴즈 리더보드
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { submitEvalComment, submitEvalScore } from '@/api';
import { Badge, Button, Dot, EmptyState, SectionHead, Sheet, TextArea } from '@/components/ui';
import { errMsg } from '@/lib/errors';
import { ACCENT, isHttpUrl, normalizeUrl, teamColor } from '@/lib/format';
import { toast } from '@/hooks/useStore';
import { useProfile } from '@/hooks/useProfile';
import { useSessionData } from '@/hooks/useSessionData';
import { orderedTeams, useEvaluations, useQuizPoints } from '@/hooks/useData';

const SCORES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export default function LiveTab() {
  const { data: prof } = useProfile();
  const session = prof?.session ?? null;
  const sid = session?.id;
  const qc = useQueryClient();
  const { data: sd } = useSessionData(session);
  const { data: evals = [] } = useEvaluations(sid, session?.eval_open ?? false);
  const { data: points = [] } = useQuizPoints(sid);

  const [evalTeam, setEvalTeam] = useState<number | null>(null);
  const [score, setScore] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!session) return null;

  const people = sd?.people ?? [];
  const teams = sd?.teams ?? [];
  const personId = prof?.profile?.person_id ?? null;
  const me = people.find((p) => p.id === personId) ?? null;
  const myTeamIdx = me?.team ?? null;
  const individual = session.team_count === 0;
  const current = session.current_present;

  const ordered = individual ? [] : orderedTeams(teams);
  const orderedPeople = individual ? orderedTeams(people) : [];
  const currentTeam = current != null ? ordered.find((t) => t.present_order === current) ?? null : null;

  const canEval = session.eval_open && session.student_eval_enabled && !individual && myTeamIdx != null;

  const openEval = (teamIdx: number) => {
    const mine = evals.find((e) => e.evaluator_person === personId && e.to_team === teamIdx);
    setScore(mine?.score ?? null);
    setComment(mine?.comment ?? '');
    setEvalTeam(teamIdx);
  };

  const submitEval = async () => {
    if (evalTeam == null) return;
    if (score == null) {
      toast('점수를 선택하세요.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      await submitEvalScore(evalTeam, score);
      if (comment.trim()) await submitEvalComment(evalTeam, comment.trim());
      qc.invalidateQueries({ queryKey: ['evaluations', sid] });
      qc.invalidateQueries({ queryKey: ['sessionData', sid] });
      toast('제출했습니다 — 다시 제출하면 수정됩니다', 'success');
      setEvalTeam(null);
    } catch (e) {
      toast(errMsg(e), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const evalTeamObj = evalTeam != null ? teams.find((t) => t.idx === evalTeam) ?? null : null;
  const myScoreFor = (teamIdx: number) =>
    evals.find((e) => e.evaluator_person === personId && e.to_team === teamIdx)?.score ?? null;

  // 퀴즈 리더보드 — 개인 순위 + 팀 합산
  const ranked = [...points].sort((a, b) => b.points - a.points || b.correct_count - a.correct_count);
  const teamAgg = !individual
    ? teams
        .map((t) => ({
          team: t,
          points: points.filter((p) => p.team === t.idx).reduce((s, p) => s + p.points, 0),
        }))
        .filter((r) => r.points > 0)
        .sort((a, b) => b.points - a.points)
    : [];

  const timelineState = (pos: number | null): 'done' | 'live' | 'wait' => {
    if (current == null || pos == null) return 'wait';
    if (pos < current) return 'done';
    if (pos === current) return 'live';
    return 'wait';
  };

  return (
    <div className="live-tab">
      <SectionHead title="발표 순서"
        right={session.present_stage === 'live' ? <Badge tone="live">발표 중</Badge> : undefined} />

      {individual ? (
        orderedPeople.length === 0 ? (
          <EmptyState>발표 순서가 아직 정해지지 않았습니다.</EmptyState>
        ) : (
          <ol className="tl">
            {orderedPeople.map((p, i) => {
              const st = timelineState(p.present_order);
              return (
                <li key={p.id} className={`tl-item tl-${st}`}>
                  <span className="tl-num">{i + 1}</span>
                  <span className="tl-name">{p.name}{p.id === personId && <span className="muted"> (나)</span>}</span>
                  {st === 'live' && <Badge tone="live">LIVE</Badge>}
                  {st === 'done' && <span className="tl-done-label">완료</span>}
                </li>
              );
            })}
          </ol>
        )
      ) : ordered.length === 0 ? (
        <EmptyState>발표 순서가 아직 정해지지 않았습니다.</EmptyState>
      ) : (
        <ol className="tl">
          {ordered.map((t, i) => {
            const st = timelineState(t.present_order);
            const given = myScoreFor(t.idx);
            return (
              <li key={t.idx} className={`tl-item tl-${st}`}>
                <span className="tl-num">{i + 1}</span>
                <span className="tl-name">
                  <Dot color={t.idx === myTeamIdx ? ACCENT : teamColor(t.idx)} />
                  {t.name}
                  {t.idx === myTeamIdx && <span className="muted"> (내 팀)</span>}
                </span>
                {st === 'live' && <Badge tone="live">LIVE</Badge>}
                {st === 'done' && <span className="tl-done-label">완료</span>}
                {canEval && t.idx !== myTeamIdx && (
                  <Button size="sm" variant={given != null ? 'ghost' : 'secondary'} onClick={() => openEval(t.idx)}>
                    {given != null ? `${given}점 수정` : '평가하기'}
                  </Button>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {currentTeam && (
        <div className="st-card current-card">
          <div className="current-head">
            <Badge tone="live">지금 발표</Badge>
            <h3 className="team-title"><Dot color={teamColor(currentTeam.idx)} />{currentTeam.name}</h3>
          </div>
          <div className="chip-row">
            {people.filter((p) => p.team === currentTeam.idx).map((m) => (
              <span key={m.id} className="chip">{m.name}</span>
            ))}
          </div>
          <div className="current-actions">
            {isHttpUrl(normalizeUrl(currentTeam.link)) && (
              <a className="open-link" href={normalizeUrl(currentTeam.link)} target="_blank" rel="noreferrer noopener">
                서비스 열기
              </a>
            )}
            {canEval && currentTeam.idx !== myTeamIdx && (
              <Button variant="primary" onClick={() => openEval(currentTeam.idx)}>
                {myScoreFor(currentTeam.idx) != null ? '평가 수정하기' : '평가하기'}
              </Button>
            )}
          </div>
        </div>
      )}

      {session.eval_open && !session.student_eval_enabled && (
        <p className="muted" style={{ marginTop: 'var(--space-3)' }}>이 세션은 학생 평가가 꺼져 있습니다.</p>
      )}

      <SectionHead title="퀴즈 리더보드"
        right={session.present_stage === 'leaderboard' ? <Badge tone="live">발표 중</Badge> : undefined} />
      <div className={`leaderboard ${session.present_stage === 'leaderboard' ? 'hot' : ''}`}>
        {ranked.length === 0 ? (
          <EmptyState>아직 퀴즈 기록이 없습니다.</EmptyState>
        ) : (
          <>
            <ol className="rank-list">
              {ranked.map((p, i) => (
                <li key={p.person_id} className={`rank-item ${p.person_id === personId ? 'me' : ''}`}>
                  <span className={`rank-num ${i < 3 ? 'top' : ''}`}>{i + 1}</span>
                  <span className="rank-name">
                    {p.name}
                    {p.person_id === personId && <span className="muted"> (나)</span>}
                  </span>
                  <span className="rank-pts">{p.points}점</span>
                </li>
              ))}
            </ol>
            {teamAgg.length > 0 && (
              <>
                <h4 className="rank-sub">팀 합산</h4>
                <ol className="rank-list">
                  {teamAgg.map((r, i) => (
                    <li key={r.team.idx} className={`rank-item ${r.team.idx === myTeamIdx ? 'me' : ''}`}>
                      <span className={`rank-num ${i < 3 ? 'top' : ''}`}>{i + 1}</span>
                      <span className="rank-name">
                        <Dot color={teamColor(r.team.idx)} />
                        {r.team.name}
                      </span>
                      <span className="rank-pts">{r.points}점</span>
                    </li>
                  ))}
                </ol>
              </>
            )}
          </>
        )}
      </div>

      <Sheet open={evalTeam != null} onClose={() => setEvalTeam(null)}
        title={evalTeamObj ? `${evalTeamObj.name} 평가` : '평가'}>
        <p className="sheet-desc">1~10점 중 선택하세요. 다시 제출하면 수정됩니다.</p>
        <div className="score-grid">
          {SCORES.map((s) => (
            <button key={s} type="button"
              className={`score-btn ${score === s ? 'sel' : ''}`}
              onClick={() => setScore(s)}>
              {s}
            </button>
          ))}
        </div>
        <TextArea value={comment} onChange={(e) => setComment(e.target.value)}
          placeholder="익명 피드백 (선택) — 팀에게 그대로 전달됩니다"
          rows={3} style={{ marginTop: 'var(--space-4)' }} />
        <div className="sheet-actions">
          <Button onClick={() => setEvalTeam(null)}>취소</Button>
          <Button variant="primary" loading={submitting} onClick={submitEval}>제출</Button>
        </div>
      </Sheet>
    </div>
  );
}
