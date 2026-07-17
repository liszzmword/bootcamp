// 첫 화면 — 참여코드 입장. 역할이 이미 있으면 해당 앱으로 리다이렉트.
import { FormEvent, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { enterSession } from '@/api';
import { errMsg } from '@/lib/errors';
import { toast } from '@/hooks/useStore';
import { useProfile, useInvalidateProfile } from '@/hooks/useProfile';
import { Button, TextInput } from '@/components/ui';
import './gate.css';

export default function GatePage() {
  const { data, isLoading } = useProfile();
  const invalidate = useInvalidateProfile();
  const nav = useNavigate();
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  if (!isLoading && data?.session) {
    const role = data.profile?.role;
    if (role === 'member') return <Navigate to="/s/home" replace />;
    if (role === 'judge') return <Navigate to="/judge" replace />;
    if (role === 'admin') return <Navigate to="/admin" replace />;
    return <Navigate to="/view" replace />;
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    setErr('');
    try {
      const name = await enterSession(code.trim());
      try { localStorage.setItem('joinCode', code.trim()); } catch { /* ignore */ }
      await invalidate();
      toast(`'${name}'에 입장했습니다`, 'success');
      nav(`/join?code=${encodeURIComponent(code.trim())}&entered=1`);
    } catch (e2) {
      setErr(errMsg(e2));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="gate">
      <form className="gate-box" onSubmit={submit}>
        <h1>Bootcamp<br />Team Board</h1>
        <p className="gate-desc">교육 참여코드를 입력하세요. 코드는 운영자에게 안내받을 수 있습니다.</p>
        <TextInput value={code} onChange={(e) => setCode(e.target.value)} placeholder="참여코드" autoComplete="off" autoFocus />
        <Button variant="primary" size="lg" loading={busy} type="submit" style={{ width: '100%', marginTop: 12 }}>
          입장
        </Button>
        <p className="gate-err">{err}</p>
      </form>
    </div>
  );
}
