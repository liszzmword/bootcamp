import { createBrowserRouter, Navigate } from 'react-router-dom';
import GatePage from './GatePage';
import JoinPage from './JoinPage';
import RequireRole from './RequireRole';
import StudentLayout from './student/StudentLayout';
import HomeTab from './student/HomeTab';
import MyTeamTab from './student/MyTeamTab';
import LiveTab from './student/LiveTab';
import ChatTab from './student/ChatTab';
import JudgePage from './judge/JudgePage';
import JudgeLoginPage from './judge/JudgeLoginPage';
import AdminLayout from './admin/AdminLayout';
import AdminLoginPage from './admin/AdminLoginPage';
import DashboardPage from './admin/DashboardPage';
import RosterPage from './admin/RosterPage';
import LiveConsolePage from './admin/LiveConsolePage';
import EvalPage from './admin/EvalPage';
import QuizAdminPage from './admin/QuizAdminPage';
import InboxPage from './admin/InboxPage';
import ArchivePage from './admin/ArchivePage';
import SessionSettingsPage from './admin/SessionSettingsPage';
import PresentPage from './PresentPage';
import ViewPage from './ViewPage';

export const router = createBrowserRouter([
  { path: '/', element: <GatePage /> },
  { path: '/join', element: <JoinPage /> },
  { path: '/view', element: <ViewPage /> },
  { path: '/present', element: <PresentPage /> },
  {
    path: '/s',
    element: <RequireRole roles={['member']}><StudentLayout /></RequireRole>,
    children: [
      { index: true, element: <Navigate to="/s/home" replace /> },
      { path: 'home', element: <HomeTab /> },
      { path: 'team', element: <MyTeamTab /> },
      { path: 'live', element: <LiveTab /> },
      { path: 'chat', element: <ChatTab /> },
    ],
  },
  { path: '/judge/login', element: <JudgeLoginPage /> },
  { path: '/judge', element: <RequireRole roles={['judge']}><JudgePage /></RequireRole> },
  { path: '/admin/login', element: <AdminLoginPage /> },
  {
    path: '/admin',
    element: <RequireRole roles={['admin']}><AdminLayout /></RequireRole>,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'roster', element: <RosterPage /> },
      { path: 'live', element: <LiveConsolePage /> },
      { path: 'eval', element: <EvalPage /> },
      { path: 'quiz', element: <QuizAdminPage /> },
      { path: 'inbox', element: <InboxPage /> },
      { path: 'archive', element: <ArchivePage /> },
      { path: 'settings', element: <SessionSettingsPage /> },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);
