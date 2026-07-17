// 관리자 셸 — 좌측 사이드바(데스크톱) / 상단 탭(모바일) + 세션 스위처
import { FormEvent, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { createSession, logout, setAdminSession } from '@/api';
import { errMsg } from '@/lib/errors';
import { toast } from '@/hooks/useStore';
import { useProfile } from '@/hooks/useProfile';
import { useRealtimeSession } from '@/hooks/useRealtime';
import { Button, EmptyState, TextInput } from '@/components/ui';
import { fmtDate } from '@/lib/format';
import './admin.css';

const MENU = [
  { to: '/admin', label: '대시보드', end: true },
  { to: '/admin/roster', label: '명단·배정' },
  { to: '/admin/live', label: '라이브 콘솔' },
  { to: '/admin/eval', label: '평가' },
  { to: '/admin/quiz', label: '퀴즈' },
  { to: '/admin/inbox', label: '공지·메시지' },
  { to: '/admin/archive', label: '아카이브' },
  { to: '/admin/settings', label: '세션 설정' },
];

export default function AdminLayout() {
  const { data } = useProfile();
  const qc = useQueryClient();
  const nav = useNavigate();
  const session = data?.session ?? null;
  const sessions = data?.sessions ?? [];

  useRealtimeSession(session?.id, 'admin');

  const switchSession = async (id: string) => {
    try {
      await setAdminSession(id);
      await qc.invalidateQueries();
    } catch (e) {
      toast(errMsg(e), 'error');
    }
  };

  const doLogout = async () => {
    try {
      await logout();
      await qc.invalidateQueries();
      nav('/admin/login', { replace: true });
    } catch (e) {
      toast(errMsg(e), 'error');
    }
  };

  if (!data) return null;

  // 관리자인데 현재 세션이 없음 → 세션 선택/생성 안내
  if (!session) {
    return <NoSession sessions={sessions} onPick={switchSession} onLogout={doLogout} />;
  }

  return (
    <div className="adm-shell">
      <aside className="adm-side">
        <div className="adm-brand">Admin</div>
        <select
          className="adm-session-select"
          value={session.id}
          aria-label="세션 선택"
          onChange={(e) => { if (e.target.value !== session.id) void switchSession(e.target.value); }}
        >
          {sessions.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <nav className="adm-nav">
          {MENU.map((m) => (
            <NavLink
              key={m.to}
              to={m.to}
              end={m.end}
              className={({ isActive }) => 'adm-nav-link' + (isActive ? ' is-active' : '')}
            >
              {m.label}
            </NavLink>
          ))}
        </nav>
        <div className="adm-side-foot">
          <Button size="sm" variant="ghost" onClick={() => void doLogout()}>로그아웃</Button>
        </div>
      </aside>
      <main className="adm-main">
        <Outlet />
      </main>
    </div>
  );
}

function NoSession({ sessions, onPick, onLogout }: {
  sessions: { id: string; name: string; created_at: string }[];
  onPick: (id: string) => Promise<void>;
  onLogout: () => Promise<void>;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !code.trim()) { toast('교육 이름과 참여코드를 입력하세요.', 'error'); return; }
    setBusy(true);
    try {
      await createSession(name.trim(), code.trim());
      await qc.invalidateQueries();
      toast(`'${name.trim()}' 교육을 만들었습니다`, 'success');
    } catch (e2) {
      toast(errMsg(e2), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="adm-nosession">
      <div className="adm-nosession-box">
        <h1>세션 선택</h1>
        <p className="adm-card-desc">진행할 교육을 선택하거나 새 교육을 만드세요.</p>
        <div className="adm-session-list">
          {sessions.length === 0 && <EmptyState>아직 만든 교육이 없습니다.</EmptyState>}
          {sessions.map((s) => (
            <button key={s.id} className="adm-session-item" onClick={() => void onPick(s.id)}>
              <span>{s.name}</span>
              <span className="adm-session-date">{fmtDate(s.created_at)}</span>
            </button>
          ))}
        </div>
        <form className="adm-card" onSubmit={create}>
          <h3>새 교육 만들기</h3>
          <p className="adm-card-desc">참여코드는 학생이 입장할 때 입력하는 코드입니다.</p>
          <div className="adm-field-row">
            <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="교육 이름" />
            <TextInput value={code} onChange={(e) => setCode(e.target.value)} placeholder="참여코드" className="is-short" autoComplete="off" />
            <Button variant="primary" type="submit" loading={busy}>만들기</Button>
          </div>
        </form>
        <Button size="sm" variant="ghost" onClick={() => void onLogout()}>로그아웃</Button>
      </div>
    </div>
  );
}
