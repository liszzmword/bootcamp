import { useQuery } from '@tanstack/react-query';
import { getFeedback, getPeople, getSecrets, getTeams } from '@/api';
import type { Feedback, Person, SessionRow, Team } from '@/types/domain';

export interface SessionData {
  people: Person[];
  teams: Team[];
  feedback: Feedback[];
}

/** 세션 보드 데이터 (people/teams/secrets/feedback) — RLS가 세션 격리, 관리자는 클라이언트 필터 */
export function useSessionData(session: SessionRow | null) {
  return useQuery({
    queryKey: ['sessionData', session?.id],
    enabled: !!session,
    refetchInterval: 15000,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<SessionData> => {
      const sid = session!.id;
      const teamCount = session!.team_count;
      const [people, teams, secrets, feedback] = await Promise.all([
        getPeople(), getTeams(), getSecrets(), getFeedback(),
      ]);
      const secretMap = new Map(secrets.filter((s) => s.session_id === sid).map((s) => [s.idx, s.api]));
      return {
        people: people
          .filter((p) => p.session_id === sid)
          .sort((a, b) => a.name.localeCompare(b.name, 'ko')),
        teams: teams
          .filter((t) => t.session_id === sid && t.idx < teamCount)
          .map((t) => ({ ...t, api: secretMap.has(t.idx) ? secretMap.get(t.idx)! : null })),
        feedback: feedback.filter((f) => f.session_id === sid),
      };
    },
  });
}
