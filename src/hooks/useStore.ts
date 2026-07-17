// 전역 클라이언트 상태 — 토스트 스택 + 퀴즈 오버레이 최소한만
import { create } from 'zustand';

export interface Toast {
  id: number;
  kind: 'success' | 'error' | 'info';
  text: string;
}

interface AppStore {
  toasts: Toast[];
  toast: (text: string, kind?: Toast['kind']) => void;
  dismissToast: (id: number) => void;
  activeQuizId: string | null; // 풀스크린 퀴즈 오버레이
  setActiveQuiz: (id: string | null) => void;
}

let toastSeq = 0;

export const useStore = create<AppStore>((set) => ({
  toasts: [],
  toast: (text, kind = 'info') => {
    const id = ++toastSeq;
    set((s) => ({ toasts: [...s.toasts.slice(-2), { id, kind, text }] })); // 최대 3개
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 3200);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  activeQuizId: null,
  setActiveQuiz: (id) => set({ activeQuizId: id }),
}));

export const toast = (text: string, kind: Toast['kind'] = 'info') => useStore.getState().toast(text, kind);
