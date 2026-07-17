// 평가자(조교) 전용 화면 — 모바일 우선. 발표 순서대로 팀 카드, 점수 탭 즉시 저장.
// 조교는 eval_open과 무관하게 항상 입력 가능.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { logout, submitEvalComment, submitEvalScore } from '@/api';
import { errMsg } from '@/lib/errors';
import { toast } from '@/hooks/useStore';
import { useProfile, useInvalidateProfile } from '@/hooks/useProfile';
import { useSessionData } from '@/hooks/useSessionData';
import { orderedTeams, useEvaluations, useJudges } from '@/hooks/useData';
import { useRealtimeSession } from '@/hooks/useRealtime';
import { isHttpUrl, normalizeUrl, teamColor } from '@/lib/format';
import { Badge, Button, Dot, EmptyState, Sheet, TextArea } from '@/components/ui';
import type { Evaluation, Person, Team } from '@/types/domain';
import './judge.css';

const SCORES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

function TeamCard({ team, members, myEval, live, sid, onComment }: {
  team: Team;
  members: Person[];
  myEval: Evaluation | undefined;
  live: boolean;
  sid: string;
  onComment: (team: Team) => void;
}) {
  const qc = useQueryClient();
  const [pending, setPending] = useState<number | null>(null);
  const score = pending ?? myEval?.score ?? null;
  const hasComment = !!myEval?.comment?.trim();
  const link = normalizeUrl(team.link);

  const tap = async (n: number) => {
    if (pending != null) return;
    setPending(n);
    try {
      await submitEvalScore(team.idx, n);
      await qc.invalidateQueries({ queryKey: ['evaluations', sid] });
      toast(`${team.name} ${n}점 저장됨`, 'success');
    } catch (e) {
      toast(errMsg(e), 'error');
    } finally {
      setPending(null);
    }
  };

  return (
    <li className={`jd-card${live ? ' jd-card-live' : ''}`}>
      <div className="jd-card-head">
        <Dot color={teamColor(team.idx)} />
        <span className="jd-team-name">{team.name}</span>
        {live && <Badge tone="live">발표 중</Badge>}
        {myEval?.score == null && <Badge tone="warning">미제출</Badge>}
      </div>
      {members.length > 0 && (
        <p className="jd-members">{members.map((m) => m.name).join(' · ')}</p>
      )}
      {isHttpUrl(link) && (
        <a className="jd-link" href={link} target="_blank" rel="noreferrer">서비스 링크 ↗</a>
      )}
      <div className="jd-scores" role="group" aria-label={`${team.name} 점수`}>
        {SCORES.map((n) => (
          <button
            key={n}
            type="button"
            className={`jd-score-btn${score === n ? ' jd-on' : ''}`}
            disabled={pending != null}
            onClick={() => tap(n)}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="jd-card-foot">
        <Button size="sm" variant={hasComment ? 'secondary' : 'ghost'} onClick={() => onComment(team)}>
          {hasComment ? '코멘트 수정' : '코멘트 남기기'}
        </Button>
        {myEval?.score != null && <span className="jd-my-score">내 점수 {myEval.score}점</span>}
      </div>
    </li>
  );
}

export default function JudgePage() {
  const { data } = useProfile();
  const invalidateProfile = useInvalidateProfile();
  const qc = useQueryClient();
  const nav = useNavigate();
  const session = data?.session ?? null;
  const sid = session?.id ?? null;
  const judgeId = data?.profile?.judge_id ?? null;

  useRealtimeSession(sid, 'judge');
  const { data: sd } = useSessionData(session);
  const { data: evals = [] } = useEvaluations(sid);
  const { data: judges = [] } = useJudges(sid);

  const [commentTeam, setCommentTeam] = useState<Team | null>(null);
  const [commentText, setCommentText] = useState('');
  const [commentBusy, setCommentBusy] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);

  if (!session || !sid) return null; // RequireRole이 보장 — 방어적 처리

  const myName = judges.find((j) => j.id === judgeId)?.name ?? '';
  const teams = sd?.teams ?? [];
  const people = sd?.people ?? [];
  const myEvals = new Map(
    evals.filter((e) => e.evaluator_judge != null && e.evaluator_judge === judgeId).map((e) => [e.to_team, e]),
  );
  const doneCount = teams.filter((t) => myEvals.get(t.idx)?.score != null).length;

  // 발표 순서 (없으면 idx순), 현재 발표 팀은 최상단
  const ordered = orderedTeams(teams);
  const base = ordered.length ? ordered : [...teams].sort((a, b) => a.idx - b.idx);
  const cur = session.current_present;
  const curTeam = cur == null ? null : ordered.find((t) => t.present_order === cur) ?? null;
  const list = curTeam == null ? base : [curTeam, ...base.filter((t) => t.idx !== curTeam.idx)];

  const openComment = (team: Team) => {
    setCommentText(myEvals.get(team.idx)?.comment ?? '');
    setCommentTeam(team);
  };

  const saveComment = async () => {
    if (!commentTeam) return;
    setCommentBusy(true);
    try {
      await submitEvalComment(commentTeam.idx, commentText.trim());
      await qc.invalidateQueries({ queryKey: ['evaluations', sid] });
      toast(`${commentTeam.name} 코멘트 저장됨`, 'success');
      setCommentTeam(null);
    } catch (e) {
      toast(errMsg(e), 'error');
    } finally {
      setCommentBusy(false);
    }
  };

  const doLogout = async () => {
    setLogoutBusy(true);
    try {
      await logout();
      await invalidateProfile();
      nav('/', { replace: true });
    } catch (e) {
      toast(errMsg(e), 'error');
      setLogoutBusy(false);
    }
  };

  return (
    <div className="jd-page">
      <header className="jd-head">
        <div className="jd-head-info">
          <h1>{session.name}</h1>
          <p className="jd-who">평가자: {myName || '—'}</p>
          <p className="jd-progress">
            {teams.length}팀 중 {doneCount}팀 평가 완료
          </p>
        </div>
        <Button size="sm" variant="ghost" loading={logoutBusy} onClick={doLogout}>로그아웃</Button>
      </header>

      {teams.length === 0 ? (
        <EmptyState>
          {session.team_count === 0 ? '이 세션은 개별활동 모드라 평가할 팀이 없습니다.' : '아직 팀이 만들어지지 않았습니다.'}
        </EmptyState>
      ) : (
        <ul className="jd-list">
          {list.map((t) => (
            <TeamCard
              key={t.idx}
              team={t}
              members={people.filter((p) => p.team === t.idx)}
              myEval={myEvals.get(t.idx)}
              live={curTeam != null && t.idx === curTeam.idx}
              sid={sid}
              onComment={openComment}
            />
          ))}
        </ul>
      )}

      <Sheet open={!!commentTeam} onClose={() => setCommentTeam(null)} title={commentTeam ? `${commentTeam.name} 코멘트` : '코멘트'}>
        <TextArea
          value={commentText}
          onChange={(e) => setCommentText(e.target.value)}
          placeholder="팀에게 전할 피드백을 적어주세요"
          rows={5}
        />
        <div className="sheet-actions">
          <Button onClick={() => setCommentTeam(null)}>취소</Button>
          <Button variant="primary" loading={commentBusy} onClick={saveComment}>저장</Button>
        </div>
      </Sheet>
    </div>
  );
}
