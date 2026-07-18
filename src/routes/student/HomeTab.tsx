// 홈 탭 — 공지 · 발표 순서 요약 · 내 퀴즈 포인트 · 내 정보
import { useProfile } from '@/hooks/useProfile';
import { useSessionData } from '@/hooks/useSessionData';
import { useNotices, useQuizPoints, orderedTeams } from '@/hooks/useData';
import { Badge, EmptyState, SectionHead, Dot } from '@/components/ui';
import { ACCENT, fmtDate } from '@/lib/format';

export default function HomeTab() {
  const { data: prof } = useProfile();
  const session = prof?.session ?? null;
  const { data: sd } = useSessionData(session);
  const { data: notices = [] } = useNotices(session?.id);
  const { data: points = [] } = useQuizPoints(session?.id);

  if (!session) return null;

  const people = sd?.people ?? [];
  const teams = sd?.teams ?? [];
  const personId = prof?.profile?.person_id ?? null;
  const me = people.find((p) => p.id === personId) ?? null;
  const individual = session.team_count === 0;
  const myTeam = !individual && me?.team != null ? teams.find((t) => t.idx === me.team) ?? null : null;

  // 발표 순서 요약 — 내가(또는 내 팀이) 몇 번째인지
  const ordered = individual ? orderedTeams(people) : orderedTeams(teams);
  let myPos: number | null = null;
  if (individual && me) {
    const i = orderedTeams(people).findIndex((p) => p.id === me.id);
    myPos = i >= 0 ? i + 1 : null;
  } else if (me?.team != null) {
    const i = orderedTeams(teams).findIndex((t) => t.idx === me.team);
    myPos = i >= 0 ? i + 1 : null;
  }

  // 내 퀴즈 포인트 + 순위(동점은 같은 순위)
  const myPoint = points.find((p) => p.person_id === personId) ?? null;
  const myRank = myPoint ? points.filter((p) => p.points > myPoint.points).length + 1 : null;

  return (
    <div className="home-tab">
      <SectionHead title="공지" sub={notices.length ? `${notices.length}건` : undefined} />
      {notices.length === 0 && <EmptyState>아직 공지가 없습니다.</EmptyState>}
      <div className="notice-list">
        {notices.map((n) => (
          <article key={n.id} className={`st-card notice-card ${n.pinned ? 'pinned' : ''}`}>
            {n.pinned && <Badge tone="warning">고정</Badge>}
            <p className="notice-body">{n.body}</p>
            <span className="notice-date">{fmtDate(n.updated_at || n.created_at)}</span>
          </article>
        ))}
      </div>

      <SectionHead title="발표 순서" />
      <div className="st-card">
        {ordered.length === 0 ? (
          <p className="muted">발표 순서가 아직 정해지지 않았습니다.</p>
        ) : myPos != null ? (
          <p className="order-summary">
            {individual ? '나는' : '내 팀은'} 전체 {ordered.length}팀 중{' '}
            <strong className="order-num">{myPos}번째</strong> 발표입니다.
          </p>
        ) : (
          <p className="muted">
            발표 순서가 정해졌지만 {individual ? '내 순서는' : '내 팀 순서는'} 아직 없습니다.
          </p>
        )}
        {session.present_stage !== 'idle' && (
          <p className="muted" style={{ marginTop: 'var(--space-2)' }}>
            지금 발표가 진행 중입니다 — 라이브 탭에서 확인하세요.
          </p>
        )}
      </div>

      <SectionHead title="내 퀴즈 포인트" />
      <div className="st-card">
        {myPoint ? (
          <div className="point-row">
            <div className="point-item">
              <span className="point-value">{myPoint.points}점</span>
              <span className="point-label">누적 포인트</span>
            </div>
            <div className="point-item">
              <span className="point-value">{myRank}위</span>
              <span className="point-label">전체 {points.length}명 중</span>
            </div>
            <div className="point-item">
              <span className="point-value">{myPoint.correct_count}개</span>
              <span className="point-label">정답 수</span>
            </div>
          </div>
        ) : (
          <p className="muted">아직 퀴즈 기록이 없습니다.</p>
        )}
      </div>

      <SectionHead title="내 정보" />
      <div className="st-card">
        {me ? (
          <dl className="info-list">
            <div><dt>이름</dt><dd>{me.name}</dd></div>
            {me.dept && <div><dt>소속</dt><dd>{me.dept}</dd></div>}
            <div>
              <dt>팀</dt>
              <dd>
                {individual ? (
                  '개별활동'
                ) : myTeam ? (
                  <span className="team-inline"><Dot color={ACCENT} />{myTeam.name}</span>
                ) : (
                  '미배정'
                )}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="muted">내 정보를 불러오는 중입니다…</p>
        )}
      </div>
    </div>
  );
}
