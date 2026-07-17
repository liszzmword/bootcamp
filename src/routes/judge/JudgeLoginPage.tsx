// 평가자(조교) 입장 — 평가자 코드 + 이름. 같은 이름 재입장 시 이전 평가 이어서 수정.
import { FormEvent, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { judgeEnter } from '@/api';
import { errMsg } from '@/lib/errors';
import { toast } from '@/hooks/useStore';
import { useProfile, useInvalidateProfile } from '@/hooks/useProfile';
import { Button, TextInput } from '@/components/ui';
import '../gate.css';

export default function JudgeLoginPage() {
  const { data, isLoading } = useProfile();
  const invalidate = useInvalidateProfile();
  const nav = useNavigate();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  if (!isLoading && data?.profile?.role === 'judge' && data.session) {
    return <Navigate to="/judge" replace />;
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!code.trim()) { setErr('평가자 코드를 입력하세요.'); return; }
    if (!name.trim()) { setErr('이름을 입력하세요.'); return; }
    setBusy(true);
    setErr('');
    try {
      const sessionName = await judgeEnter(code.trim(), name.trim());
      await invalidate();
      toast(`'${sessionName}' 세션에 평가자로 입장했습니다`, 'success');
      nav('/judge', { replace: true });
    } catch (e2) {
      setErr(errMsg(e2));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="gate">
      <form className="gate-box" onSubmit={submit}>
        <h1>평가자(조교) 입장</h1>
        <p className="gate-desc">
          운영자에게 받은 평가자 코드와 본인 이름을 입력하세요.
          같은 이름으로 다시 들어오면 이전 평가를 이어서 수정합니다.
          조교끼리 겹치지 않는 고유한 이름을 쓰세요.
        </p>
        <div style={{ display: 'grid', gap: 10 }}>
          <TextInput value={code} onChange={(e) => setCode(e.target.value)} placeholder="평가자 코드" autoComplete="off" autoFocus />
          <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="이름" autoComplete="off" />
        </div>
        <Button variant="primary" size="lg" loading={busy} type="submit" style={{ width: '100%', marginTop: 12 }}>
          입장
        </Button>
        <p className="gate-err">{err}</p>
      </form>
    </div>
  );
}
