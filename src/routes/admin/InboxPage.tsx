// 메시지함 — 학생 DM 스레드(답장/읽음 처리) + 공지 작성/수정/삭제
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { addNotice, adminReplyDm, deleteNotice, markDmRead, updateNotice } from '@/api';
import { useDms, useNotices } from '@/hooks/useData';
import { useProfile } from '@/hooks/useProfile';
import { useSessionData } from '@/hooks/useSessionData';
import { toast } from '@/hooks/useStore';
import { errMsg } from '@/lib/errors';
import { fmtDate } from '@/lib/format';
import { Badge, Button, ConfirmSheet, EmptyState, SectionHead, Sheet, TextArea } from '@/components/ui';
import type { DmMessage, Notice, SessionRow } from '@/types/domain';
import './adminlive.css';

interface Thread {
  pid: string;
  msgs: DmMessage[];
  last: DmMessage;
  unread: number;
}

export default function InboxPage() {
  const { data, isLoading } = useProfile();
  const session = data?.session ?? null;
  if (isLoading) return <EmptyState>불러오는 중…</EmptyState>;
  if (!session) return <EmptyState>세션에 입장한 뒤 이용할 수 있습니다.</EmptyState>;
  return <InboxBody session={session} />;
}

function InboxBody({ session }: { session: SessionRow }) {
  const sid = session.id;
  const qc = useQueryClient();
  const { data: sd } = useSessionData(session);
  const people = sd?.people ?? [];
  const dms = useDms(sid).data ?? [];
  const notices = useNotices(sid).data ?? [];

  /* ---------- DM 스레드 ---------- */
  const threads = useMemo<Thread[]>(() => {
    const map = new Map<string, DmMessage[]>();
    for (const m of dms) {
      const arr = map.get(m.person_id);
      if (arr) arr.push(m);
      else map.set(m.person_id, [m]);
    }
    return [...map.entries()]
      .map(([pid, msgs]) => ({
        pid,
        msgs,
        last: msgs[msgs.length - 1],
        unread: msgs.filter((m) => !m.from_admin && m.read_at == null).length,
      }))
      .sort((a, b) => b.last.created_at.localeCompare(a.last.created_at));
  }, [dms]);
  const totalUnread = threads.reduce((s, t) => s + t.unread, 0);

  const personName = (pid: string) => people.find((p) => p.id === pid)?.name ?? '(명단에 없음)';

  const [activePid, setActivePid] = useState<string | null>(null);
  const active = threads.find((t) => t.pid === activePid) ?? null;
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const bubbleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = bubbleRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [activePid, active?.msgs.length]);

  const openThread = (t: Thread) => {
    setActivePid(t.pid);
    setReply('');
    if (t.unread > 0) {
      markDmRead(t.pid)
        .then(() => qc.invalidateQueries({ queryKey: ['dms', sid] }))
        .catch(() => { /* 다음 열람 때 재시도 */ });
    }
  };

  const send = async () => {
    const body = reply.trim();
    if (!body || !activePid) return;
    setSending(true);
    try {
      await adminReplyDm(activePid, body);
      setReply('');
      await qc.invalidateQueries({ queryKey: ['dms', sid] });
    } catch (e) {
      toast(errMsg(e), 'error');
    } finally {
      setSending(false);
    }
  };

  /* ---------- 공지 ---------- */
  const [nBody, setNBody] = useState('');
  const [nPinned, setNPinned] = useState(false);
  const [posting, setPosting] = useState(false);
  const [edit, setEdit] = useState<Notice | null>(null);
  const [editBody, setEditBody] = useState('');
  const [editPinned, setEditPinned] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [delNotice, setDelNotice] = useState<Notice | null>(null);

  const postNotice = async () => {
    const body = nBody.trim();
    if (!body) { toast('공지 내용을 입력하세요.', 'error'); return; }
    setPosting(true);
    try {
      await addNotice(body, nPinned);
      setNBody('');
      setNPinned(false);
      await qc.invalidateQueries({ queryKey: ['notices', sid] });
      toast('공지를 등록했습니다', 'success');
    } catch (e) {
      toast(errMsg(e), 'error');
    } finally {
      setPosting(false);
    }
  };

  const openEdit = (n: Notice) => {
    setEdit(n);
    setEditBody(n.body);
    setEditPinned(n.pinned);
  };

  const saveEdit = async () => {
    if (!edit) return;
    const body = editBody.trim();
    if (!body) { toast('공지 내용을 입력하세요.', 'error'); return; }
    setEditSaving(true);
    try {
      await updateNotice(edit.id, body, editPinned);
      setEdit(null);
      await qc.invalidateQueries({ queryKey: ['notices', sid] });
      toast('공지를 수정했습니다', 'success');
    } catch (e) {
      toast(errMsg(e), 'error');
    } finally {
      setEditSaving(false);
    }
  };

  return (
    <div className="al-page">
      <div className="al-cols">
        {/* DM 인박스 */}
        <section>
          <SectionHead
            title="DM 인박스"
            sub={`${threads.length}개 대화`}
            right={totalUnread > 0 ? <span className="al-unread">{totalUnread}</span> : undefined}
          />
          <div className="al-card">
            {threads.length === 0 ? (
              <EmptyState>받은 메시지가 없습니다.</EmptyState>
            ) : (
              threads.map((t) => (
                <button key={t.pid} type="button" className="al-thread" onClick={() => openThread(t)}>
                  <span className="al-thread-name">{personName(t.pid)}</span>
                  <span className="al-thread-last">{t.last.from_admin ? '나: ' : ''}{t.last.body}</span>
                  <span className="al-muted">{fmtDate(t.last.created_at)}</span>
                  {t.unread > 0 && <span className="al-unread">{t.unread}</span>}
                </button>
              ))
            )}
          </div>
        </section>

        {/* 공지 관리 */}
        <section>
          <SectionHead title="공지 관리" sub="고정 공지가 먼저 표시됩니다" />
          <div className="al-card">
            <TextArea
              value={nBody}
              onChange={(e) => setNBody(e.target.value)}
              placeholder="새 공지 내용"
              rows={3}
            />
            <div className="al-row">
              <label className="al-check">
                <input type="checkbox" checked={nPinned} onChange={(e) => setNPinned(e.target.checked)} />
                상단 고정
              </label>
              <span style={{ marginLeft: 'auto' }}>
                <Button variant="primary" loading={posting} onClick={postNotice}>공지 등록</Button>
              </span>
            </div>
          </div>
          <div className="al-stack" style={{ marginTop: 'var(--space-3)' }}>
            {notices.length === 0 ? (
              <EmptyState>등록된 공지가 없습니다.</EmptyState>
            ) : (
              notices.map((n) => (
                <div key={n.id} className={`al-notice ${n.pinned ? 'is-pinned' : ''}`}>
                  <div className="al-row">
                    {n.pinned && <Badge tone="warning">고정</Badge>}
                    <span className="al-muted">
                      {fmtDate(n.created_at)}
                      {n.updated_at ? ` · 수정 ${fmtDate(n.updated_at)}` : ''}
                    </span>
                    <span style={{ marginLeft: 'auto' }} className="al-row">
                      <Button size="sm" variant="ghost" onClick={() => openEdit(n)}>수정</Button>
                      <Button size="sm" variant="ghost" onClick={() => setDelNotice(n)}>삭제</Button>
                    </span>
                  </div>
                  <p className="al-pre">{n.body}</p>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      {/* 스레드 뷰 */}
      <Sheet
        open={activePid != null}
        onClose={() => setActivePid(null)}
        title={activePid ? personName(activePid) : undefined}
      >
        <div className="al-bubbles" ref={bubbleRef}>
          {(active?.msgs ?? []).map((m) => (
            <div key={m.id} className={`al-bubble ${m.from_admin ? 'is-admin' : ''}`}>
              {m.body}
              <span className="al-bubble-time">{fmtDate(m.created_at)}</span>
            </div>
          ))}
        </div>
        <div className="al-row">
          <TextArea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder="답장을 입력하세요"
            rows={2}
            style={{ flex: 1, minHeight: 56 }}
          />
          <Button variant="primary" loading={sending} disabled={!reply.trim()} onClick={send}>보내기</Button>
        </div>
      </Sheet>

      {/* 공지 수정 */}
      <Sheet open={edit != null} onClose={() => setEdit(null)} title="공지 수정">
        <TextArea value={editBody} onChange={(e) => setEditBody(e.target.value)} rows={4} />
        <div className="al-row" style={{ marginTop: 'var(--space-3)' }}>
          <label className="al-check">
            <input type="checkbox" checked={editPinned} onChange={(e) => setEditPinned(e.target.checked)} />
            상단 고정
          </label>
          <span style={{ marginLeft: 'auto' }} className="al-row">
            <Button onClick={() => setEdit(null)}>취소</Button>
            <Button variant="primary" loading={editSaving} onClick={saveEdit}>저장</Button>
          </span>
        </div>
      </Sheet>

      {/* 공지 삭제 */}
      <ConfirmSheet
        open={delNotice != null}
        onClose={() => setDelNotice(null)}
        title="공지 삭제"
        desc={delNotice ? `이 공지를 삭제할까요?\n\n${delNotice.body.slice(0, 80)}${delNotice.body.length > 80 ? '…' : ''}` : undefined}
        okLabel="삭제"
        danger
        onOk={async () => {
          try {
            if (delNotice) await deleteNotice(delNotice.id);
            await qc.invalidateQueries({ queryKey: ['notices', sid] });
          } catch (e) {
            toast(errMsg(e), 'error');
          }
        }}
      />
    </div>
  );
}
