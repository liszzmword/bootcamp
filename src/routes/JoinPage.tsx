// QR 랜딩 — ?code= 자동 입장 후 학번+이름 2필드 온보딩. 명단에 없으면 확인 후 자체 등록.
import { FormEvent, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { enterSession, memberEnter } from '@/api';
import { errMsg, isErr } from '@/lib/errors';
import { toast } from '@/hooks/useStore';
import { useInvalidateProfile } from '@/hooks/useProfile';
import { Button, ConfirmSheet, TextInput } from '@/components/ui';
import './gate.css';

export default function JoinPage() {
  const [params] = useSearchParams();
  const code = params.get('code') ?? '';
  const nav = useNavigate();
  const invalidate = useInvalidateProfile();
  const [sessionName, setSessionName] = useState<string | null>(null);
  const [sno, setSno] = useState('');
  const [name, setName] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmNew, setConfirmNew] = useState(false);
  const enteredRef = useRef(false);

  useEffect(() => {
    if (!code) { nav('/', { replace: true }); return; }
    if (enteredRef.current) return;
    enteredRef.current = true;
    enterSession(code)
      .then(async (n) => {
        setSessionName(n);
        try { localStorage.setItem('joinCode', code); } catch { /* ignore */ }
        await invalidate();
      })
      .catch((e) => setErr(errMsg(e)));
  }, [code, nav, invalidate]);

  const enter = async (register: boolean) => {
    setBusy(true);
    setErr('');
    try {
      await memberEnter(name.trim(), sno.trim(), code, register);
      await invalidate();
      toast(`${name.trim()}님, 입장했습니다`, 'success');
      nav('/s/home', { replace: true });
    } catch (e) {
      if (isErr(e, 'CONFIRM_NEW')) { setConfirmNew(true); return; }
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!sno.trim()) { setErr('학번을 입력하세요.'); return; }
    if (!name.trim()) { setErr('이름을 입력하세요.'); return; }
    void enter(false);
  };

  return (
    <div className="gate">
      <form className="gate-box" onSubmit={submit}>
        <h1>{sessionName ?? '입장 중…'}</h1>
        <p className="gate-desc">학번과 이름을 입력하면 본인 팀 화면으로 이동합니다.</p>
        <div style={{ display: 'grid', gap: 10 }}>
          <TextInput value={sno} onChange={(e) => setSno(e.target.value)} placeholder="학번" autoComplete="off" inputMode="numeric" autoFocus />
          <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="이름" autoComplete="off" />
        </div>
        <Button variant="primary" size="lg" loading={busy} type="submit" style={{ width: '100%', marginTop: 12 }}>
          들어가기
        </Button>
        <p className="gate-err">{err}</p>
        <p className="gate-alt">
          구경만 할래요? <button type="button" onClick={() => nav('/view')}>둘러보기로 계속</button>
        </p>
      </form>
      <ConfirmSheet
        open={confirmNew}
        onClose={() => setConfirmNew(false)}
        title="신규 등록"
        desc={`명단에 없는 이름입니다.\n'${name.trim()}' (학번 ${sno.trim()})으로 새로 등록할까요?\n이름·학번에 오타가 없는지 확인하세요.`}
        okLabel="새로 등록"
        onOk={() => enter(true)}
      />
    </div>
  );
}
