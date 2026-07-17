import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useProfile } from '@/hooks/useProfile';
import type { Role } from '@/types/domain';

/** 역할 게이트 — 프로필 로딩 완료 전에는 아무것도 렌더하지 않아 플리커 방지 */
export default function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { data, isLoading } = useProfile();
  if (isLoading) return <div style={{ padding: 40, color: 'var(--color-text-faint)' }}>불러오는 중…</div>;
  const role = data?.profile?.role ?? 'viewer';
  if (!roles.includes(role)) {
    if (roles.includes('admin')) return <Navigate to="/admin/login" replace />;
    if (roles.includes('judge')) return <Navigate to="/judge/login" replace />;
    return <Navigate to="/" replace />;
  }
  if (!data?.session && !roles.includes('admin')) return <Navigate to="/" replace />;
  return <>{children}</>;
}
