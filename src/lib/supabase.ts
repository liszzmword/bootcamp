import { createClient } from '@supabase/supabase-js';

// ⚠ auth.storageKey를 지정하지 않는다 — 기본 키(sb-<ref>-auth-token)를 유지해야
//   기존 v2 앱에서 로그인한 익명 세션(uid↔profiles)이 전환 후에도 살아 있다.
export const sb = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
);

let myUidCache: string | null = null;

/** 익명 세션 보장. 성공 시 uid 반환 */
export async function ensureAuth(): Promise<string> {
  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    myUidCache = session.user.id;
    return session.user.id;
  }
  const { data, error } = await sb.auth.signInAnonymously();
  if (error) {
    throw new Error(
      `접속 세션 생성 실패: ${error.message} — Supabase에서 "Allow anonymous sign-ins"가 켜져 있는지 확인하세요.`,
    );
  }
  myUidCache = data.user?.id ?? null;
  return myUidCache ?? '';
}

export function myUid(): string | null {
  return myUidCache;
}

/** security definer RPC 호출 — 에러는 서버 예외 코드 문자열을 담아 throw */
export async function rpc<T = unknown>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await sb.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}
