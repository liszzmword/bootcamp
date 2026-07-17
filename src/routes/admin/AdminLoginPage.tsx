// 관리자 로그인 — 최초 설정과 로그인이 같은 폼 (adminSet=false면 이 비밀번호가 설정됨)
import { FormEvent, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { adminLogin } from '@/api';
import { errMsg } from '@/lib/errors';
import { useProfile, useInvalidateProfile } from '@/hooks/useProfile';
import { Button, TextInput } from '@/components/ui';
import '../gate.css';

export default function AdminLoginPage() {
  const { data, isLoading } = useProfile();
  const invalidate = useInvalidateProfile();
  const nav = useNavigate();
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  if (!isLoading && data?.profile?.role === 'admin') return <Navigate to="/admin" replace />;

  const firstTime = !!data && !data.adminSet;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!pw) { setErr('비밀번호를 입력하세요.'); return; }
    setBusy(true);
    setErr('');
    try {
      await adminLogin(pw);
      await invalidate();
      nav('/admin', { replace: true });
    } catch (e2) {
      setErr(errMsg(e2));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="gate">
      <form className="gate-box" onSubmit={submit}>
        <h1>Admin</h1>
        <p className="gate-desc">
          {firstTime
            ? '처음입니다 — 지금 입력하는 비밀번호가 관리자 비밀번호로 설정됩니다.'
            : '관리자 비밀번호를 입력하세요.'}
        </p>
        <TextInput
          type="password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          placeholder="관리자 비밀번호"
          autoComplete="current-password"
          autoFocus
        />
        <Button variant="primary" size="lg" loading={busy} type="submit" style={{ width: '100%', marginTop: 12 }}>
          {firstTime ? '비밀번호 설정하고 시작' : '로그인'}
        </Button>
        <p className="gate-err">{err}</p>
        <p className="gate-alt">
          <button type="button" onClick={() => nav('/')}>← 참여코드 입장으로</button>
        </p>
      </form>
    </div>
  );
}
