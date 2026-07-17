// 프로젝터 전용 화면 — 다크 강제, 초대형 타이포, 조작 UI 없음.
// 3초 폴링으로 present_stage를 따라 idle/order/live/leaderboard 전환.
import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import qrcode from 'qrcode-generator';
import { getSessionCode, getSessions } from '@/api';
import { useProfile } from '@/hooks/useProfile';
import { useSessionData } from '@/hooks/useSessionData';
import { orderedTeams, useQuizPoints } from '@/hooks/useData';
import { teamColor } from '@/lib/format';
import type { QuizPoint, SessionRow, Team } from '@/types/domain';
import './present.css';

function Timer({ startedAt, seconds }: { startedAt: string | null; seconds: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const remain = startedAt == null
    ? seconds
    : seconds - Math.floor((now - new Date(startedAt).getTime()) / 1000);
  const over = remain < 0;
  const abs = Math.abs(remain);
  const mm = String(Math.floor(abs / 60)).padStart(2, '0');
  const ss = String(abs % 60).padStart(2, '0');
  return <div className={`pr-timer${over ? ' pr-over' : ''}`}>{over ? '-' : ''}{mm}:{ss}</div>;
}

function Leaderboard({ session, points, teams }: { session: SessionRow; points: QuizPoint[]; teams: Team[] }) {
  const top = [...points].sort((a, b) => b.points - a.points || b.correct_count - a.correct_count).slice(0, 10);
  const max = Math.max(1, ...top.map((p) => p.points));
  const teamName = (idx: number | null) =>
    idx == null ? '' : teams.find((t) => t.idx === idx)?.name ?? `팀 ${idx + 1}`;

  const totals = new Map<number, number>();
  for (const p of points) {
    if (p.team != null) totals.set(p.team, (totals.get(p.team) ?? 0) + p.points);
  }
  const teamTop = [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);

  return (
    <div className="pr-board">
      <h2 className="pr-stage-label">{session.name} — 퀴즈 리더보드</h2>
      {top.length === 0 ? (
        <p className="pr-empty">아직 포인트가 없습니다</p>
      ) : (
        <ol className="pr-bars">
          {top.map((p, i) => (
            <li key={p.person_id} className="pr-bar-row">
              <span className="pr-rank">{i + 1}</span>
              <span className="pr-bar-name">
                {p.name}
                {p.team != null && <em className="pr-bar-team">{teamName(p.team)}</em>}
              </span>
              <span className="pr-bar-track">
                <span
                  className="pr-bar-fill"
                  style={{ width: `${Math.max(4, (p.points / max) * 100)}%`, background: p.team != null ? teamColor(p.team) : 'var(--color-text-muted)' }}
                />
              </span>
              <span className="pr-bar-pts">{p.points}점</span>
            </li>
          ))}
        </ol>
      )}
      {teamTop.length > 0 && (
        <div className="pr-team-totals">
          {teamTop.map(([idx, sum], i) => (
            <div key={idx} className="pr-team-total">
              <span className="pr-rank">{i + 1}</span>
              <span className="pr-total-dot" style={{ background: teamColor(idx) }} />
              <span className="pr-total-name">{teamName(idx)}</span>
              <span className="pr-total-pts">{sum}점</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function PresentPage() {
  const { data: prof, isLoading } = useProfile();
  const sessionId = prof?.profile?.session_id ?? null;

  // 프로젝터는 3초 간격으로 세션 상태만 다시 읽는다
  const { data: sessions } = useQuery({
    queryKey: ['presentSessions'],
    queryFn: getSessions,
    refetchInterval: 3000,
    enabled: !!sessionId,
  });
  const session = sessions?.find((s) => s.id === sessionId) ?? prof?.session ?? null;

  const { data: sd } = useSessionData(session);
  const { data: points = [] } = useQuizPoints(sessionId);

  // 참여코드: 관리자면 서버에서, 아니면 localStorage joinCode 폴백
  const { data: joinCode = null } = useQuery({
    queryKey: ['presentJoinCode', sessionId],
    enabled: !!sessionId,
    staleTime: 60000,
    queryFn: async (): Promise<string | null> => {
      try {
        const r = await getSessionCode(sessionId!);
        if (r?.code) return r.code;
      } catch { /* 관리자 권한 없음 */ }
      try { return localStorage.getItem('joinCode'); } catch { return null; }
    },
  });

  // 다크 테마 강제 (언마운트 시 원복)
  useEffect(() => {
    const root = document.documentElement;
    const prev = root.dataset.theme;
    root.dataset.theme = 'dark';
    return () => {
      if (prev == null) delete root.dataset.theme;
      else root.dataset.theme = prev;
    };
  }, []);

  const qrSvg = useMemo(() => {
    if (!joinCode) return null;
    const qr = qrcode(0, 'M');
    qr.addData(location.origin + '/#code=' + encodeURIComponent(joinCode));
    qr.make();
    return qr.createSvgTag({ cellSize: 8, margin: 0, scalable: true });
  }, [joinCode]);

  if (!isLoading && !sessionId) return <Navigate to="/" replace />;
  if (!session) {
    return (
      <main className="pr-root">
        <div className="pr-stage pr-center"><p className="pr-empty">불러오는 중…</p></div>
      </main>
    );
  }

  const individual = session.team_count === 0;
  const teams = sd?.teams ?? [];
  const people = sd?.people ?? [];
  const cur = session.current_present;
  const orderT = orderedTeams(teams);
  const baseT = orderT.length ? orderT : [...teams].sort((a, b) => a.idx - b.idx);
  const orderP = orderedTeams(people);
  const curTeamPos = cur == null ? -1 : baseT.findIndex((t) => t.present_order === cur);
  const curPersonPos = cur == null ? -1 : orderP.findIndex((p) => p.present_order === cur);
  const stage = session.present_stage;

  let content;
  if (stage === 'order') {
    const rows = individual
      ? orderP.map((p, i) => ({ key: p.id, name: p.name, color: null as string | null, cur: i === curPersonPos, done: curPersonPos >= 0 && i < curPersonPos }))
      : baseT.map((t, i) => ({ key: String(t.idx), name: t.name, color: teamColor(t.idx), cur: i === curTeamPos, done: curTeamPos >= 0 && i < curTeamPos }));
    content = (
      <div className="pr-order">
        <h2 className="pr-stage-label">발표 순서</h2>
        {rows.length === 0 ? (
          <p className="pr-empty">발표 순서가 아직 정해지지 않았습니다</p>
        ) : (
          <ol className="pr-order-list">
            {rows.map((r, i) => (
              <li key={r.key} className={`pr-order-row${r.cur ? ' pr-cur' : ''}${r.done ? ' pr-done' : ''}`}>
                <span className="pr-order-no">{r.done ? '✓' : i + 1}</span>
                {r.color && <span className="pr-total-dot" style={{ background: r.color }} />}
                <span className="pr-order-name">{r.name}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    );
  } else if (stage === 'live') {
    const curTeam = individual ? null : teams.find((t) => t.present_order === cur) ?? null;
    const curPerson = individual ? orderP.find((p) => p.present_order === cur) ?? null : null;
    const name = individual ? curPerson?.name : curTeam?.name;
    const members = !individual && curTeam != null ? people.filter((p) => p.team === curTeam.idx) : [];
    const next = individual
      ? (curPersonPos >= 0 ? orderP[curPersonPos + 1] : undefined)?.name
      : (curTeamPos >= 0 ? baseT[curTeamPos + 1] : undefined)?.name;
    content = (
      <div className="pr-live">
        <p className="pr-now">NOW PRESENTING</p>
        <h1 className="pr-live-name">{name ?? '—'}</h1>
        {members.length > 0 && <p className="pr-live-members">{members.map((m) => m.name).join(' · ')}</p>}
        <Timer startedAt={session.timer_started_at} seconds={session.timer_seconds} />
        {next && <p className="pr-next">다음: {next}</p>}
      </div>
    );
  } else if (stage === 'leaderboard') {
    content = <Leaderboard session={session} points={points} teams={teams} />;
  } else {
    content = (
      <div className="pr-idle">
        <h1 className="pr-session-name">{session.name}</h1>
        {qrSvg && <div className="pr-qr" dangerouslySetInnerHTML={{ __html: qrSvg }} />}
        {joinCode && (
          <>
            <div className="pr-code">{joinCode}</div>
            <p className="pr-hint">휴대폰 카메라로 QR을 찍거나 첫 화면에서 참여코드를 입력하세요</p>
          </>
        )}
      </div>
    );
  }

  return (
    <main className="pr-root">
      <div key={stage} className="pr-stage">{content}</div>
    </main>
  );
}
