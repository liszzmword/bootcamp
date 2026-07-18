export const fmtSize = (b: number): string =>
  b >= 1048576 ? (b / 1048576).toFixed(1) + 'MB' : Math.max(1, Math.round(b / 1024)) + 'KB';

export const fmtDate = (iso: string | null | undefined): string =>
  iso
    ? new Date(iso).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '';

export const fmtTime = (iso: string | null | undefined): string =>
  iso ? new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '';

/** DS: 팀 구분색 폐기 — 무채색 통일, '내 팀/현재 항목'만 ACCENT 사용 (tokens.css --team-N과 동기) */
export const TEAM_COLORS = ['#2b2b2b'];
export const teamColor = (_i: number): string => '#2b2b2b';
export const ACCENT = '#ff7120';

/** 스킴 없는 주소(myapp.vercel.app)에 https:// 보정. javascript: 등 다른 스킴은 그대로(링크화 안 함) */
export function normalizeUrl(v: string | null | undefined): string {
  const s = (v || '').trim();
  if (!s || /^https?:\/\//i.test(s)) return s;
  if (/^[a-z][a-z0-9+.\-]*:/i.test(s)) return s;
  return s.includes('.') || s.startsWith('localhost') ? 'https://' + s : s;
}

export const isHttpUrl = (v: string): boolean => /^https?:\/\//.test(v);

export const csvEsc = (s: unknown): string => {
  const t = String(s ?? '');
  return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
};

export function downloadCsv(rows: unknown[][], filename: string): void {
  const csv = '﻿' + rows.map((r) => r.map(csvEsc).join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}

export function downloadUrl(url: string, filename: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
}
