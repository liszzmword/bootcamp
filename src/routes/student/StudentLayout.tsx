// 학생 앱 레이아웃 — 상단 얇은 헤더 + 하단 고정 탭바 (모바일 우선)
import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { logout } from '@/api';
import { errMsg } from '@/lib/errors';
import { toast } from '@/hooks/useStore';
import { useInvalidateProfile, useProfile } from '@/hooks/useProfile';
import { useRealtimeSession } from '@/hooks/useRealtime';
import { Button } from '@/components/ui';
import QuizOverlay from '@/components/QuizOverlay';
import './student.css';

function TabIcon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

const ICONS = {
  home: 'M3 10.5 12 3l9 7.5 M5 9.5 V21 h14 V9.5',
  team: 'M16 21 v-2 a4 4 0 0 0-4-4 H6 a4 4 0 0 0-4 4 v2 M9 11 a4 4 0 1 0 0-8 a4 4 0 0 0 0 8 M22 21 v-2 a4 4 0 0 0-3-3.87 M15 3.13 a4 4 0 0 1 0 7.75',
  live: 'M12 12 m-2 0 a2 2 0 1 0 4 0 a2 2 0 1 0 -4 0 M16.24 7.76 a6 6 0 0 1 0 8.49 M7.76 16.24 a6 6 0 0 1 0-8.49 M19.07 4.93 a10 10 0 0 1 0 14.14 M4.93 19.07 a10 10 0 0 1 0-14.14',
  chat: 'M21 15 a2 2 0 0 1-2 2 H7 l-4 4 V5 a2 2 0 0 1 2-2 h14 a2 2 0 0 1 2 2 z',
};

export default function StudentLayout() {
  const { data } = useProfile();
  const invalidate = useInvalidateProfile();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const session = data?.session ?? null;
  useRealtimeSession(session?.id, 'member');

  if (!session) return null; // RequireRole이 보장 — 방어

  const liveOn = session.present_stage !== 'idle' || session.eval_open;

  const onLogout = async () => {
    setBusy(true);
    try {
      await logout();
      await invalidate();
      nav('/');
    } catch (e) {
      toast(errMsg(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  const tabs = [
    { to: '/s/home', label: '홈', icon: ICONS.home, dot: false },
    { to: '/s/team', label: '내 팀', icon: ICONS.team, dot: false },
    { to: '/s/live', label: '라이브', icon: ICONS.live, dot: liveOn },
    { to: '/s/chat', label: '채팅', icon: ICONS.chat, dot: false },
  ];

  return (
    <div className="student-app">
      <header className="st-header">
        <div className="st-header-inner">
          <span className="st-session-name">{session.name}</span>
          <Button variant="ghost" size="sm" loading={busy} onClick={onLogout}>로그아웃</Button>
        </div>
      </header>
      <main className="st-main">
        <Outlet />
      </main>
      <nav className="st-tabbar" aria-label="학생 메뉴">
        <div className="st-tabbar-inner">
          {tabs.map((t) => (
            <NavLink key={t.to} to={t.to} className={({ isActive }) => `st-tab ${isActive ? 'active' : ''}`}>
              <span className="st-tab-icon">
                <TabIcon d={t.icon} />
                {t.dot && <span className="st-tab-dot" aria-label="진행 중" />}
              </span>
              <span>{t.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
      <QuizOverlay />
    </div>
  );
}
