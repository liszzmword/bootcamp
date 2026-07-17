import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getProfile, getSessions, getSettings } from '@/api';
import type { Profile, SessionRow } from '@/types/domain';

export interface ProfileState {
  profile: Profile | null;
  sessions: SessionRow[];
  session: SessionRow | null; // 현재 입장한 세션
  adminSet: boolean;
}

/** 모든 역할 가드의 근원 — 프로필 + 세션 목록 + 현재 세션 */
export function useProfile() {
  const q = useQuery({
    queryKey: ['profile'],
    queryFn: async (): Promise<ProfileState> => {
      const [profile, sessions, settings] = await Promise.all([getProfile(), getSessions(), getSettings()]);
      const session = sessions.find((s) => s.id === profile?.session_id) ?? null;
      return { profile, sessions, session, adminSet: settings.admin_set };
    },
    refetchInterval: 15000,
    refetchOnWindowFocus: true,
  });
  return q;
}

export function useInvalidateProfile() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['profile'] });
}
