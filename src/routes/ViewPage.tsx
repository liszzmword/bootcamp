// 둘러보기 — 읽기 전용 단일 스크롤. 공지 / 발표 순서 / 팀 그리드 / 개별 제출.
import { Navigate, useNavigate } from 'react-router-dom';
import { useProfile } from '@/hooks/useProfile';
import { useSessionData } from '@/hooks/useSessionData';
import { orderedTeams, useNotices } from '@/hooks/useData';
import { fmtDate, isHttpUrl, normalizeUrl, teamColor } from '@/lib/format';
import { Badge, Button, Dot, EmptyState, SectionHead } from '@/components/ui';
import './judge/judge.css';

export default function ViewPage() {
  const { data, isLoading } = useProfile();
  const nav = useNavigate();
  const session = data?.session ?? null;
  const { data: sd } = useSessionData(session);
  const { data: notices = [] } = useNotices(session?.id);

  if (isLoading) return <div style={{ padding: 40, color: 'var(--color-text-faint)' }}>불러오는 중…</div>;
  if (!session) return <Navigate to="/" replace />;

  const individual = session.team_count === 0;
  const teams = sd?.teams ?? [];
  const people = sd?.people ?? [];
  const feedback = sd?.feedback ?? [];
  const orderT = orderedTeams(teams);
  const orderP = orderedTeams(people);
  const submissions = people.filter((p) => p.work_link.trim() || p.work_memo.trim());

  const joinCta = () => {
    let code = '';
    try { code = localStorage.getItem('joinCode') || ''; } catch { /* ignore */ }
    nav(code ? `/join?code=${encodeURIComponent(code)}` : '/');
  };

  return (
    <div className="jd-view">
      <div className="jd-view-cta">
        <span className="jd-view-cta-label">지금은 둘러보기 모드입니다</span>
        <Button variant="primary" size="sm" onClick={joinCta}>팀원으로 입장하기</Button>
      </div>

      <div className="jd-view-body">
        <h1 className="jd-view-title">{session.name}</h1>

        <SectionHead title="공지" sub={notices.length ? `${notices.length}건` : undefined} />
        {notices.length === 0 ? (
          <EmptyState>아직 공지가 없습니다.</EmptyState>
        ) : (
          <ul className="jd-notice-list">
            {notices.map((n) => (
              <li key={n.id} className="jd-notice">
                <div className="jd-notice-meta">
                  {n.pinned && <Badge tone="success">고정</Badge>}
                  <span>{fmtDate(n.updated_at ?? n.created_at)}</span>
                </div>
                <p className="jd-notice-body">{n.body}</p>
              </li>
            ))}
          </ul>
        )}

        {(individual ? orderP.length : orderT.length) > 0 && (
          <>
            <SectionHead title="발표 순서" />
            <ol className="jd-order-list">
              {individual
                ? orderP.map((p) => (
                    <li key={p.id} className="jd-order-item">{p.name}</li>
                  ))
                : orderT.map((t) => (
                    <li key={t.idx} className={`jd-order-item${t.idx === session.current_present ? ' jd-order-cur' : ''}`}>
                      <Dot color={teamColor(t.idx)} /> {t.name}
                      {t.idx === session.current_present && <Badge tone="live">발표 중</Badge>}
                    </li>
                  ))}
            </ol>
          </>
        )}

        {!individual && (
          <>
            <SectionHead title="팀" sub={`${teams.length}팀`} />
            {teams.length === 0 ? (
              <EmptyState>아직 팀이 만들어지지 않았습니다.</EmptyState>
            ) : (
              <div className="jd-view-grid">
                {teams.map((t) => {
                  const members = people.filter((p) => p.team === t.idx);
                  const fbs = feedback.filter((f) => f.to_team === t.idx);
                  const ppt = normalizeUrl(t.ppt);
                  const link = normalizeUrl(t.link);
                  return (
                    <div key={t.idx} className="jd-card">
                      <div className="jd-card-head">
                        <Dot color={teamColor(t.idx)} />
                        <span className="jd-team-name">{t.name}</span>
                      </div>
                      {members.length > 0 && <p className="jd-members">{members.map((m) => m.name).join(' · ')}</p>}
                      <div className="jd-view-links">
                        {isHttpUrl(ppt) && <a href={ppt} target="_blank" rel="noreferrer">발표 자료 ↗</a>}
                        {isHttpUrl(link) && <a href={link} target="_blank" rel="noreferrer">서비스 링크 ↗</a>}
                      </div>
                      {fbs.length > 0 && (
                        <details className="jd-fb">
                          <summary>받은 피드백 {fbs.length}건</summary>
                          <ul>
                            {fbs.map((f, i) => (
                              <li key={i}>
                                <p>{f.comment}</p>
                                <span className="jd-fb-date">{fmtDate(f.updated_at)}</span>
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {individual && (
          <>
            <SectionHead title="개별 제출" sub={`${submissions.length}명 제출`} />
            {submissions.length === 0 ? (
              <EmptyState>아직 제출한 사람이 없습니다.</EmptyState>
            ) : (
              <div className="jd-view-grid">
                {submissions.map((p) => {
                  const link = normalizeUrl(p.work_link);
                  return (
                    <div key={p.id} className="jd-card">
                      <div className="jd-card-head">
                        <span className="jd-team-name">{p.name}</span>
                      </div>
                      {isHttpUrl(link) && (
                        <div className="jd-view-links">
                          <a href={link} target="_blank" rel="noreferrer">작업물 링크 ↗</a>
                        </div>
                      )}
                      {p.work_memo.trim() && <p className="jd-members">{p.work_memo}</p>}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
