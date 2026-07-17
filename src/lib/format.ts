export const fmtSize = (b: number): string =>
  b >= 1048576 ? (b / 1048576).toFixed(1) + 'MB' : Math.max(1, Math.round(b / 1024)) + 'KB';

export const fmtDate = (iso: string | null | undefined): string =>
  iso
    ? new Date(iso).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '';

export const fmtTime = (iso: string | null | undefined): string =>
  iso ? new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '';

/** 8색 고정 팔레트 (tokens.css --team-N과 동기) */
export const TEAM_COLORS = ['#e0533d', '#2f9e63', '#8a4fd3', '#d1a422', '#d8447c', '#1d7fd1', '#d97a1f', '#4a9a97'];
export const teamColor = (i: number): string => TEAM_COLORS[((i % 8) + 8) % 8];

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
