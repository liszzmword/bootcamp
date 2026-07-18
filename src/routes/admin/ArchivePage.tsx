// 아카이브 — 변경 이력(팀 필터), 현재 자료 일람, 전체 CSV
import { useMemo, useState } from 'react';
import { pptDownloadUrl } from '@/api';
import { useSubmissions } from '@/hooks/useData';
import { useProfile } from '@/hooks/useProfile';
import { useSessionData } from '@/hooks/useSessionData';
import { toast } from '@/hooks/useStore';
import { downloadCsv, fmtDate, fmtSize, isHttpUrl, normalizeUrl, teamColor } from '@/lib/format';
import { Button, ClampText, Dot, EmptyState, SectionHead } from '@/components/ui';
import type { SessionRow, Submission } from '@/types/domain';
import './adminlive.css';

const FIELD_LABELS: Record<string, string> = {
  name: '팀 이름',
  ppt: 'PPT 링크',
  link: '서비스 링크',
  memo: '메모',
  api: 'API 키',
  ppt_file: '발표파일',
  work_link: '개별 링크',
  work_memo: '개별 메모',
};

/** 변경값 표시 — 파일 메타는 이름만, 긴 문자열(링크)은 잘라서 */
function fmtVal(v: unknown): string {
  if (v == null || v === '') return '(없음)';
  if (typeof v === 'object') {
    const o = v as { name?: unknown };
    return typeof o.name === 'string' ? o.name : JSON.stringify(v);
  }
  const s = String(v);
  return s.length > 42 ? `${s.slice(0, 40)}…` : s;
}

function shortUrl(v: string): string {
  const s = v.replace(/^https?:\/\//i, '');
  return s.length > 38 ? `${s.slice(0, 36)}…` : s;
}

export default function ArchivePage() {
  const { data, isLoading } = useProfile();
  const session = data?.session ?? null;
  if (isLoading) return <EmptyState>불러오는 중…</EmptyState>;
  if (!session) return <EmptyState>세션에 입장한 뒤 이용할 수 있습니다.</EmptyState>;
  return <ArchiveBody session={session} />;
}

function ArchiveBody({ session }: { session: SessionRow }) {
  const sid = session.id;
  const indiv = session.team_count === 0;
  const { data: sd } = useSessionData(session);
  const teams = sd?.teams ?? [];
  const people = sd?.people ?? [];
  const submissions = useSubmissions(sid).data ?? [];

  const teamName = (i: number) => teams.find((t) => t.idx === i)?.name ?? `팀 ${i + 1}`;
  const personName = (pid: string) => people.find((p) => p.id === pid)?.name ?? '(명단에 없음)';

  /* ---------- 변경 이력 ---------- */
  const [filter, setFilter] = useState('all');
  const filtered = useMemo(
    () => submissions.filter((s) => {
      if (filter === 'all') return true;
      if (filter === 'indiv') return s.person_id != null;
      return s.team_idx === Number(filter);
    }),
    [submissions, filter],
  );

  const target = (s: Submission) => (
    s.team_idx != null
      ? <span className="al-row"><Dot color={teamColor(s.team_idx)} /><strong>{teamName(s.team_idx)}</strong></span>
      : <strong>개별: {s.person_id ? personName(s.person_id) : '?'}</strong>
  );

  /* ---------- 현재 자료 ---------- */
  const submitters = people.filter((p) => p.work_link.trim() !== '' || p.work_memo.trim() !== '');

  const linkOrText = (v: string) => {
    const u = normalizeUrl(v);
    return isHttpUrl(u)
      ? <a href={u} target="_blank" rel="noreferrer">{shortUrl(v)}</a>
      : <span>{shortUrl(v)}</span>;
  };

  /* ---------- 전체 CSV (RosterPage와 동일 형식) ---------- */
  const downloadAllCsv = () => {
    const rows: unknown[][] = [
      ['팀', '이름', '학번', '소속', 'API 키', 'PPT 링크', '서비스 링크', '발표파일', '메모', '개별 링크', '개별 메모'],
    ];
    for (const t of teams) {
      for (const p of people.filter((x) => x.team === t.idx)) {
        rows.push([
          t.name, p.name, p.student_no || '', p.dept, t.api || '', t.ppt, t.link,
          t.ppt_file?.name ?? '', t.memo, p.work_link || '', p.work_memo || '',
        ]);
      }
    }
    for (const p of people.filter((x) => x.team == null || !teams.some((t) => t.idx === x.team))) {
      rows.push(['미배정', p.name, p.student_no || '', p.dept, '', '', '', '', '', p.work_link || '', p.work_memo || '']);
    }
    downloadCsv(rows, `팀배정_${new Date().toISOString().slice(0, 10)}.csv`);
    toast('CSV를 내려받았습니다 (엑셀에서 열립니다)', 'success');
  };

  return (
    <div className="al-page">
      <SectionHead
        title="아카이브"
        sub={session.name}
        right={<Button size="sm" onClick={downloadAllCsv}>전체 CSV</Button>}
      />

      {/* 변경 이력 */}
      <SectionHead
        title="변경 이력"
        sub={`${filtered.length}건`}
        right={(
          <select className="al-select" aria-label="이력 필터" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">전체</option>
            {teams.map((t) => <option key={t.idx} value={String(t.idx)}>{t.name}</option>)}
            <option value="indiv">개별 활동</option>
          </select>
        )}
      />
      {filtered.length === 0 ? (
        <EmptyState>변경 이력이 없습니다.</EmptyState>
      ) : (
        <div className="al-card">
          <div className="al-hist">
            {filtered.map((s) => (
              <div key={s.id} className="al-hist-item">
                <div className="al-hist-meta">
                  <span className="al-muted">{fmtDate(s.created_at)}</span>
                  {target(s)}
                  <span className="al-muted">{s.actor_name || '?'}</span>
                </div>
                {Object.entries(s.changes).map(([field, ch]) => (
                  <div key={field} className="al-change">
                    <span className="al-change-field">{FIELD_LABELS[field] ?? field}</span>
                    <span className="al-change-old">{fmtVal(ch.old)}</span>
                    <span aria-hidden>→</span>
                    <span className="al-change-new">{fmtVal(ch.new)}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 현재 자료 일람 */}
      <SectionHead title="현재 자료" sub="팀별 제출 자료와 개별 제출" />
      {!indiv && (
        teams.length === 0 ? (
          <EmptyState>팀이 없습니다.</EmptyState>
        ) : (
          <div className="al-grid">
            {teams.map((t) => (
              <div key={t.idx} className="al-card">
                <div className="al-row"><Dot color={teamColor(t.idx)} /><strong>{t.name}</strong></div>
                <dl className="al-kv">
                  <dt>PPT</dt>
                  <dd>{t.ppt.trim() ? linkOrText(t.ppt) : '—'}</dd>
                  <dt>서비스</dt>
                  <dd>{t.link.trim() ? linkOrText(t.link) : '—'}</dd>
                  <dt>파일</dt>
                  <dd>
                    {t.ppt_file
                      ? (
                        <a href={pptDownloadUrl(sid, t.idx, t.ppt_file)}>
                          {t.ppt_file.name} ({fmtSize(t.ppt_file.size)})
                        </a>
                      )
                      : '—'}
                  </dd>
                  <dt>메모</dt>
                  <dd>{t.memo.trim() ? <ClampText className="al-pre" lines={2} title={`${t.name} — 팀 메모`} text={t.memo} /> : '—'}</dd>
                </dl>
              </div>
            ))}
          </div>
        )
      )}
      <div className="al-card">
        <h3 className="al-card-title">개별 제출</h3>
        {submitters.length === 0 ? (
          <EmptyState>개별 제출이 없습니다.</EmptyState>
        ) : (
          <div className="al-hist">
            {submitters.map((p) => (
              <div key={p.id} className="al-hist-item">
                <div className="al-row">
                  <strong>{p.name}</strong>
                  {p.team != null && !indiv && (
                    <span className="al-row al-muted"><Dot color={teamColor(p.team)} />{teamName(p.team)}</span>
                  )}
                </div>
                {p.work_link.trim() !== '' && <div>{linkOrText(p.work_link)}</div>}
                {p.work_memo.trim() !== '' && <ClampText className="al-pre al-muted" lines={2} title={`${p.name} — 제출 메모`} text={p.work_memo} />}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
