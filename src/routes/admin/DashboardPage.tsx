// 관리자 대시보드 — 상태 타일 + 빠른 액션(QR/라이브/공지) + 최근 공지
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import qrcode from 'qrcode-generator';
import { addNotice, getSessionCode } from '@/api';
import { errMsg } from '@/lib/errors';
import { toast } from '@/hooks/useStore';
import { useProfile } from '@/hooks/useProfile';
import { useSessionData } from '@/hooks/useSessionData';
import { useDms, useEvaluations, useNotices } from '@/hooks/useData';
import { Badge, Button, ClampText, EmptyState, SectionHead, Sheet, TextArea } from '@/components/ui';
import { fmtDate } from '@/lib/format';
import type { SessionRow } from '@/types/domain';
import './admin.css';

export default function DashboardPage() {
  const { data } = useProfile();
  if (!data?.session) return null;
  return <Dashboard key={data.session.id} session={data.session} />;
}

function Dashboard({ session }: { session: SessionRow }) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const sid = session.id;
  const indiv = session.team_count === 0;

  const { data: sd } = useSessionData(session);
  const people = sd?.people ?? [];
  const teams = sd?.teams ?? [];
  const { data: evals = [] } = useEvaluations(sid);
  const { data: dms = [] } = useDms(sid);
  const { data: notices = [] } = useNotices(sid);
  const codeQ = useQuery({
    queryKey: ['sessionCode', sid],
    queryFn: () => getSessionCode(sid),
  });

  const assigned = people.filter((p) => p.team != null).length;
  const submitted = indiv
    ? people.filter((p) => p.work_link).length
    : teams.filter((t) => t.ppt || t.link).length;
  const scored = evals.filter((e) => e.score != null).length;
  const unread = dms.filter((d) => !d.from_admin && d.read_at === null).length;
  const recent = notices.slice().sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 3);

  const [qrOpen, setQrOpen] = useState(false);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [noticeBody, setNoticeBody] = useState('');
  const [noticeBusy, setNoticeBusy] = useState(false);

  const code = codeQ.data?.code ?? '';
  const joinUrl = code ? `${window.location.origin}/#code=${encodeURIComponent(code)}` : '';

  const postNotice = async () => {
    if (!noticeBody.trim()) { toast('공지 내용을 입력하세요.', 'error'); return; }
    setNoticeBusy(true);
    try {
      await addNotice(noticeBody.trim());
      await qc.invalidateQueries({ queryKey: ['notices', sid] });
      toast('공지를 등록했습니다', 'success');
      setNoticeBody('');
      setNoticeOpen(false);
    } catch (e) {
      toast(errMsg(e), 'error');
    } finally {
      setNoticeBusy(false);
    }
  };

  return (
    <div>
      <SectionHead title={session.name} sub={indiv ? '개별활동 모드' : `${session.team_count}팀`} />

      <div className="adm-tiles">
        <div className="adm-tile">
          <div className="adm-tile-num">
            {people.length}<small>명</small>
          </div>
          <div className="adm-tile-label">총 인원</div>
          {!indiv && <div className="adm-tile-sub">배정 {assigned} · 미배정 {people.length - assigned}</div>}
        </div>
        <div className="adm-tile">
          <div className="adm-tile-num">
            {submitted}<small>{indiv ? `/${people.length}명` : `/${session.team_count}팀`}</small>
          </div>
          <div className="adm-tile-label">{indiv ? '결과물 제출 인원' : '제출 팀 수'}</div>
          <div className="adm-tile-sub">{indiv ? '개별 링크 등록 기준' : 'PPT 또는 서비스 링크 기준'}</div>
        </div>
        <div className="adm-tile">
          <div className="adm-tile-num">
            {scored}<small>건</small>
          </div>
          <div className="adm-tile-label">평가 진행</div>
          <div className="adm-tile-sub">{session.eval_open ? '평가 진행 중' : '평가 닫힘'}</div>
        </div>
        <button
          className={'adm-tile' + (unread > 0 ? ' is-alert' : '')}
          onClick={() => nav('/admin/inbox')}
        >
          <div className="adm-tile-num">
            {unread}<small>건</small>
          </div>
          <div className="adm-tile-label">미읽음 메시지</div>
          <div className="adm-tile-sub">눌러서 공지·메시지로 이동</div>
        </button>
      </div>

      <SectionHead title="빠른 액션" />
      <div className="adm-actions">
        <Button variant="primary" onClick={() => setQrOpen(true)}>QR 띄우기</Button>
        <Button onClick={() => nav('/admin/live')}>라이브 콘솔 열기</Button>
        <Button onClick={() => setNoticeOpen(true)}>공지 작성</Button>
      </div>

      <SectionHead
        title="최근 공지"
        right={<Button size="sm" variant="ghost" onClick={() => nav('/admin/inbox')}>전체 보기</Button>}
      />
      {recent.length === 0 ? (
        <EmptyState>아직 공지가 없습니다.</EmptyState>
      ) : (
        recent.map((n) => (
          <div key={n.id} className="adm-notice">
            {n.pinned && <Badge tone="warning">고정</Badge>}
            <ClampText lines={2} title="공지" text={n.body} />
            <time>{fmtDate(n.created_at)}</time>
          </div>
        ))
      )}

      <Sheet open={qrOpen} onClose={() => setQrOpen(false)} title="참여 QR">
        {code ? (
          <div className="adm-qr-wrap">
            <div className="adm-qr-code">{code}</div>
            <QrSvg url={joinUrl} />
            <div className="adm-qr-url">{joinUrl}</div>
          </div>
        ) : (
          <EmptyState>참여코드가 아직 설정되지 않았습니다. 세션 설정에서 코드를 정하세요.</EmptyState>
        )}
      </Sheet>

      <Sheet open={noticeOpen} onClose={() => setNoticeOpen(false)} title="공지 작성">
        <TextArea
          value={noticeBody}
          onChange={(e) => setNoticeBody(e.target.value)}
          placeholder="전체 공지 내용을 입력하세요"
          rows={5}
        />
        <div className="sheet-actions">
          <Button onClick={() => setNoticeOpen(false)}>취소</Button>
          <Button variant="primary" loading={noticeBusy} onClick={() => void postNotice()}>등록</Button>
        </div>
      </Sheet>
    </div>
  );
}

function QrSvg({ url }: { url: string }) {
  const svg = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(url);
    qr.make();
    return qr.createSvgTag({ cellSize: 5, margin: 2, scalable: true });
  }, [url]);
  return <div className="adm-qr" dangerouslySetInnerHTML={{ __html: svg }} />;
}
