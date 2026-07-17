// 페이지 공용 쿼리 훅 — queryKey 규약: [자원, sessionId]
import { useQuery } from '@tanstack/react-query';
import {
  getChat, getDms, getEvaluations, getJudges, getNotices,
  getQuizAnswers, getQuizPoints, getQuizzes, getSubmissions,
} from '@/api';

export function useNotices(sessionId: string | null | undefined) {
  return useQuery({
    queryKey: ['notices', sessionId],
    enabled: !!sessionId,
    refetchInterval: 30000,
    queryFn: async () => (await getNotices()).filter((n) => n.session_id === sessionId),
  });
}

export function useChatMessages(sessionId: string | null | undefined) {
  return useQuery({
    queryKey: ['chat', sessionId],
    enabled: !!sessionId,
    refetchInterval: 15000, // realtime 끊김 폴백
    queryFn: async () => (await getChat(sessionId!)).slice().reverse(), // 오래된 → 최신
  });
}

export function useQuizzes(sessionId: string | null | undefined) {
  return useQuery({
    queryKey: ['quizzes', sessionId],
    enabled: !!sessionId,
    refetchInterval: 15000,
    queryFn: async () => (await getQuizzes()).filter((q) => q.session_id === sessionId),
  });
}

export function useQuizAnswers(sessionId: string | null | undefined, quizId?: string, fast = false) {
  return useQuery({
    queryKey: ['quizAnswers', sessionId, quizId ?? 'all'],
    enabled: !!sessionId,
    refetchInterval: fast ? 2000 : 15000,
    queryFn: async () => (await getQuizAnswers(quizId)).filter((a) => a.session_id === sessionId),
  });
}

export function useQuizPoints(sessionId: string | null | undefined) {
  return useQuery({
    queryKey: ['quizPoints', sessionId],
    enabled: !!sessionId,
    refetchInterval: 30000,
    queryFn: async () => (await getQuizPoints()).filter((p) => p.session_id === sessionId),
  });
}

export function useDms(sessionId: string | null | undefined) {
  return useQuery({
    queryKey: ['dms', sessionId],
    enabled: !!sessionId,
    refetchInterval: 15000,
    queryFn: async () => (await getDms()).filter((d) => d.session_id === sessionId),
  });
}

export function useEvaluations(sessionId: string | null | undefined, fast = false) {
  return useQuery({
    queryKey: ['evaluations', sessionId],
    enabled: !!sessionId,
    refetchInterval: fast ? 5000 : 15000,
    queryFn: async () => (await getEvaluations()).filter((e) => e.session_id === sessionId),
  });
}

export function useJudges(sessionId: string | null | undefined) {
  return useQuery({
    queryKey: ['judges', sessionId],
    enabled: !!sessionId,
    refetchInterval: 30000,
    queryFn: async () => (await getJudges()).filter((j) => j.session_id === sessionId),
  });
}

export function useSubmissions(sessionId: string | null | undefined) {
  return useQuery({
    queryKey: ['submissions', sessionId],
    enabled: !!sessionId,
    refetchInterval: 30000,
    queryFn: async () => (await getSubmissions()).filter((s) => s.session_id === sessionId),
  });
}

/** 발표 순서 정렬 도우미: present_order 지정된 팀만, 순서대로 */
export function orderedTeams<T extends { present_order: number | null }>(items: T[]): T[] {
  return items
    .filter((t) => t.present_order != null)
    .sort((a, b) => (a.present_order ?? 0) - (b.present_order ?? 0));
}
