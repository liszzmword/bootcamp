// 채팅 탭 — 세션 채팅 / 운영자에게(DM) 세그먼트
import { FormEvent, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { markDmRead, sendChat, sendDm } from '@/api';
import { Badge, Button, EmptyState, TextInput } from '@/components/ui';
import { errMsg } from '@/lib/errors';
import { fmtDate } from '@/lib/format';
import { toast } from '@/hooks/useStore';
import { useProfile } from '@/hooks/useProfile';
import { useChatMessages, useDms } from '@/hooks/useData';

const ROLE_LABEL: Record<string, string> = { admin: '관리자', judge: '조교' };

export default function ChatTab() {
  const { data: prof } = useProfile();
  const session = prof?.session ?? null;
  const sid = session?.id;
  const personId = prof?.profile?.person_id ?? null;
  const qc = useQueryClient();

  const [seg, setSeg] = useState<'chat' | 'dm'>('chat');
  const [text, setText] = useState('');
  const [dmText, setDmText] = useState('');
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const { data: msgs = [] } = useChatMessages(sid);
  const { data: dms = [] } = useDms(sid);
  const myDms = dms.filter((d) => d.person_id === personId);
  const unreadDm = myDms.filter((d) => d.from_admin && !d.read_at).length;

  // 새 메시지·탭 전환 시 맨 아래로
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [msgs.length, myDms.length, seg]);

  // 운영자에게 탭 입장 시 읽음 처리
  useEffect(() => {
    if (seg !== 'dm' || unreadDm === 0) return;
    markDmRead(null)
      .then(() => qc.invalidateQueries({ queryKey: ['dms', sid] }))
      .catch(() => { /* 읽음 실패는 무시 */ });
  }, [seg, unreadDm, qc, sid]);

  if (!session) return null;

  const submitChat = async (e: FormEvent) => {
    e.preventDefault();
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      await sendChat(body);
      setText('');
      qc.invalidateQueries({ queryKey: ['chat', sid] });
    } catch (e2) {
      toast(errMsg(e2), 'error');
    } finally {
      setSending(false);
    }
  };

  const submitDm = async (e: FormEvent) => {
    e.preventDefault();
    const body = dmText.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      await sendDm(body);
      setDmText('');
      qc.invalidateQueries({ queryKey: ['dms', sid] });
    } catch (e2) {
      toast(errMsg(e2), 'error');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="chat-page">
      <div className="chat-seg" role="tablist">
        <button type="button" role="tab" aria-selected={seg === 'chat'}
          className={`chat-seg-btn ${seg === 'chat' ? 'active' : ''}`} onClick={() => setSeg('chat')}>
          세션 채팅
        </button>
        <button type="button" role="tab" aria-selected={seg === 'dm'}
          className={`chat-seg-btn ${seg === 'dm' ? 'active' : ''}`} onClick={() => setSeg('dm')}>
          운영자에게
          {unreadDm > 0 && <span className="seg-unread">{unreadDm}</span>}
        </button>
      </div>

      {seg === 'chat' ? (
        <div className="bubble-list">
          {msgs.length === 0 && <EmptyState>아직 메시지가 없습니다. 첫 메시지를 남겨보세요.</EmptyState>}
          {msgs.map((m) => {
            const mine = m.author_person != null && m.author_person === personId;
            return (
              <div key={m.id} className={`bubble-row ${mine ? 'mine' : ''}`}>
                <div className="bubble-meta">
                  {!mine && <span className="bubble-name">{m.author_name}</span>}
                  {!mine && ROLE_LABEL[m.author_role] && (
                    <Badge tone={m.author_role === 'admin' ? 'warning' : 'default'}>{ROLE_LABEL[m.author_role]}</Badge>
                  )}
                  <span>{fmtDate(m.created_at)}</span>
                </div>
                <div className="bubble">{m.body}</div>
              </div>
            );
          })}
          <div ref={endRef} />
        </div>
      ) : (
        <div className="bubble-list">
          {myDms.length === 0 && (
            <EmptyState>운영자에게만 보이는 1:1 대화입니다. 궁금한 점을 남겨보세요.</EmptyState>
          )}
          {myDms.map((d) => (
            <div key={d.id} className={`bubble-row ${d.from_admin ? '' : 'mine'}`}>
              <div className="bubble-meta">
                {d.from_admin && <Badge tone="warning">운영자</Badge>}
                <span>{fmtDate(d.created_at)}</span>
              </div>
              <div className="bubble">{d.body}</div>
            </div>
          ))}
          <div ref={endRef} />
        </div>
      )}

      {seg === 'chat' ? (
        <form className="chat-input" onSubmit={submitChat}>
          <TextInput value={text} onChange={(e) => setText(e.target.value)}
            placeholder="메시지 입력…" maxLength={2000} autoComplete="off" />
          <Button variant="primary" type="submit" loading={sending} disabled={!text.trim()}>전송</Button>
        </form>
      ) : (
        <form className="chat-input" onSubmit={submitDm}>
          <TextInput value={dmText} onChange={(e) => setDmText(e.target.value)}
            placeholder="운영자에게 보낼 메시지…" maxLength={2000} autoComplete="off" />
          <Button variant="primary" type="submit" loading={sending} disabled={!dmText.trim()}>전송</Button>
        </form>
      )}
    </div>
  );
}
