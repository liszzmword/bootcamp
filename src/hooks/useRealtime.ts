// Realtime 구독 — 채팅/퀴즈/DM/공지만. 끊김 시 폴백은 각 쿼리의 refetchInterval이 담당.
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { sb } from '@/lib/supabase';
import { useStore } from '@/hooks/useStore';
import type { Quiz } from '@/types/domain';

export function useRealtimeSession(sessionId: string | null | undefined, role: string | undefined) {
  const qc = useQueryClient();
  const setActiveQuiz = useStore((s) => s.setActiveQuiz);

  useEffect(() => {
    if (!sessionId) return;
    const ch = sb
      .channel(`session-${sessionId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'chat_messages', filter: `session_id=eq.${sessionId}` },
        () => qc.invalidateQueries({ queryKey: ['chat', sessionId] }))
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'quizzes', filter: `session_id=eq.${sessionId}` },
        (payload) => {
          const q = payload.new as Quiz;
          qc.invalidateQueries({ queryKey: ['quizzes', sessionId] });
          if (q.status === 'open' && role === 'member') setActiveQuiz(q.id);
          if (q.status === 'closed') qc.invalidateQueries({ queryKey: ['quizPoints', sessionId] });
        })
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'dm_messages', filter: `session_id=eq.${sessionId}` },
        () => qc.invalidateQueries({ queryKey: ['dms', sessionId] }))
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'notices', filter: `session_id=eq.${sessionId}` },
        () => qc.invalidateQueries({ queryKey: ['notices', sessionId] }))
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [sessionId, role, qc, setActiveQuiz]);
}
