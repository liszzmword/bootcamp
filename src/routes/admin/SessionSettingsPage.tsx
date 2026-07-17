// 세션 설정 — 이름/코드/평가자 코드/자체등록/팀 수/새 교육/Danger Zone
import { FormEvent, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import qrcode from 'qrcode-generator';
import {
  createSession, deleteSession, getJudgeCode, getSessionCode,
  renameSession, setAllowRegister, setJudgeCode, setSessionCode, setTeamCount,
} from '@/api';
import { errMsg } from '@/lib/errors';
import { toast } from '@/hooks/useStore';
import { useProfile } from '@/hooks/useProfile';
import { Button, EmptyState, SaveButton, SectionHead, Sheet, TextInput, useSaveField } from '@/components/ui';
import type { SessionRow } from '@/types/domain';
import './admin.css';

export default function SessionSettingsPage() {
  const { data } = useProfile();
  if (!data?.session) return null;
  return <Settings key={data.session.id} session={data.session} />;
}

function Settings({ session }: { session: SessionRow }) {
  const qc = useQueryClient();
  const nav = useNavigate();
  const sid = session.id;

  const invalidateProfile = () => qc.invalidateQueries({ queryKey: ['profile'] });

  const codeQ = useQuery({ queryKey: ['sessionCode', sid], queryFn: () => getSessionCode(sid) });
  const judgeQ = useQuery({ queryKey: ['judgeCode', sid], queryFn: () => getJudgeCode(sid) });

  /* 세션명 */
  const nameField = useSaveField(session.name, async (v) => {
    if (!v.trim()) throw new Error('세션 이름을 입력하세요.');
    await renameSession(v.trim());
    await invalidateProfile();
  });

  /* 참여코드 */
  const codeField = useSaveField(codeQ.data?.code ?? '', async (v) => {
    await setSessionCode(v.trim());
    await qc.invalidateQueries({ queryKey: ['sessionCode', sid] });
  });

  /* 평가자 코드 */
  const judgeField = useSaveField(judgeQ.data?.code ?? '', async (v) => {
    await setJudgeCode(v.trim());
    await qc.invalidateQueries({ queryKey: ['judgeCode', sid] });
  });

  /* 팀 수 */
  const countField = useSaveField(String(session.team_count), async (v) => {
    const n = Math.max(0, Math.min(99, parseInt(v, 10) || 0));
    await setTeamCount(n);
    await invalidateProfile();
    await qc.invalidateQueries({ queryKey: ['sessionData', sid] });
  });

  /* 자체등록 토글 */
  const [regBusy, setRegBusy] = useState(false);
  const toggleRegister = async () => {
    setRegBusy(true);
    try {
      await setAllowRegister(!session.allow_register);
      await invalidateProfile();
    } catch (e) {
      toast(errMsg(e), 'error');
    } finally {
      setRegBusy(false);
    }
  };

  /* QR */
  const [qrOpen, setQrOpen] = useState(false);
  const code = codeQ.data?.code ?? '';
  const joinUrl = code ? `${window.location.origin}/#code=${encodeURIComponent(code)}` : '';

  /* 새 교육 */
  const [newName, setNewName] = useState('');
  const [newCode, setNewCode] = useState('');
  const [newBusy, setNewBusy] = useState(false);
  const createNew = async (e: FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newCode.trim()) { toast('교육 이름과 참여코드를 입력하세요.', 'error'); return; }
    setNewBusy(true);
    try {
      await createSession(newName.trim(), newCode.trim());
      await qc.invalidateQueries();
      toast(`'${newName.trim()}' 교육을 만들었습니다 — 새 세션으로 전환되었습니다`, 'success');
      setNewName(''); setNewCode('');
    } catch (e2) {
      toast(errMsg(e2), 'error');
    } finally {
      setNewBusy(false);
    }
  };

  /* 세션 삭제 — 이름 입력 확인 */
  const [delOpen, setDelOpen] = useState(false);
  const [delName, setDelName] = useState('');
  const [delBusy, setDelBusy] = useState(false);
  const doDelete = async () => {
    setDelBusy(true);
    try {
      await deleteSession();
      await qc.invalidateQueries();
      toast('세션을 삭제했습니다', 'success');
      nav('/admin', { replace: true });
    } catch (e) {
      toast(errMsg(e), 'error');
    } finally {
      setDelBusy(false);
    }
  };

  return (
    <div>
      <SectionHead title="세션 설정" sub={session.name} />

      <div className="adm-card">
        <h3>세션 이름</h3>
        <div className="adm-field-row">
          <TextInput value={nameField.value} onChange={(e) => nameField.onChange(e.target.value)} placeholder="교육 이름" />
          <SaveButton state={nameField.state} onSave={nameField.onSave} />
        </div>
      </div>

      <div className="adm-card">
        <h3>참여코드</h3>
        <p className="adm-card-desc">학생이 첫 화면·QR로 입장할 때 쓰는 코드입니다. 바꾸면 이전 코드는 무효가 됩니다.</p>
        <div className="adm-field-row">
          <TextInput value={codeField.value} onChange={(e) => codeField.onChange(e.target.value)} placeholder="참여코드" autoComplete="off" />
          <SaveButton state={codeField.state} onSave={codeField.onSave} />
          <Button size="sm" onClick={() => setQrOpen(true)} disabled={!code}>QR</Button>
        </div>
      </div>

      <div className="adm-card">
        <h3>평가자 코드</h3>
        <p className="adm-card-desc">조교(심사위원)는 /judge/login에서 이 코드와 본인 이름으로 입장합니다.</p>
        <div className="adm-field-row">
          <TextInput value={judgeField.value} onChange={(e) => judgeField.onChange(e.target.value)} placeholder="평가자 코드" autoComplete="off" />
          <SaveButton state={judgeField.state} onSave={judgeField.onSave} />
        </div>
      </div>

      <div className="adm-card">
        <h3>신규 자체등록</h3>
        <div className="adm-switch-row">
          <span className="adm-switch-label adm-card-desc" style={{ marginBottom: 0 }}>
            명단에 없는 학생이 입장 화면에서 스스로 등록하는 것을 {session.allow_register ? '허용합니다' : '차단합니다'}.
          </span>
          <button
            className={'adm-switch' + (session.allow_register ? ' is-on' : '')}
            role="switch"
            aria-checked={session.allow_register}
            aria-label="신규 자체등록 허용"
            disabled={regBusy}
            onClick={() => void toggleRegister()}
          />
        </div>
      </div>

      <div className="adm-card">
        <h3>팀 수</h3>
        <p className="adm-card-desc">0으로 두면 팀 없이 각자 활동하는 개별활동 모드가 됩니다.</p>
        <div className="adm-field-row" style={{ maxWidth: 260 }}>
          <TextInput
            type="number"
            min={0}
            max={99}
            className="is-short"
            value={countField.value}
            onChange={(e) => countField.onChange(e.target.value)}
          />
          <SaveButton state={countField.state} onSave={countField.onSave} />
        </div>
      </div>

      <form className="adm-card" onSubmit={createNew}>
        <h3>새 교육 만들기</h3>
        <p className="adm-card-desc">새 세션을 만들면 즉시 그 세션으로 전환됩니다. 지금 세션의 데이터는 그대로 남습니다.</p>
        <div className="adm-field-row">
          <TextInput value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="교육 이름" />
          <TextInput value={newCode} onChange={(e) => setNewCode(e.target.value)} placeholder="참여코드" className="is-short" autoComplete="off" />
          <Button variant="primary" type="submit" loading={newBusy}>만들기</Button>
        </div>
      </form>

      <div className="adm-card is-danger">
        <h3>Danger Zone</h3>
        <p className="adm-card-desc">세션을 삭제하면 명단·팀·평가·퀴즈·메시지가 모두 사라지며 되돌릴 수 없습니다.</p>
        <Button variant="danger" onClick={() => { setDelName(''); setDelOpen(true); }}>세션 삭제</Button>
      </div>

      <Sheet open={qrOpen} onClose={() => setQrOpen(false)} title="참여 QR">
        {code ? (
          <div className="adm-qr-wrap">
            <div className="adm-qr-code">{code}</div>
            <QrSvg url={joinUrl} />
            <div className="adm-qr-url">{joinUrl}</div>
          </div>
        ) : (
          <EmptyState>참여코드가 아직 설정되지 않았습니다.</EmptyState>
        )}
      </Sheet>

      <Sheet open={delOpen} onClose={() => setDelOpen(false)} title="세션 삭제">
        <p className="sheet-desc">
          {`'${session.name}' 세션의 모든 데이터가 영구 삭제됩니다.\n계속하려면 세션 이름을 똑같이 입력하세요.`}
        </p>
        <TextInput
          value={delName}
          onChange={(e) => setDelName(e.target.value)}
          placeholder={session.name}
          autoComplete="off"
        />
        <div className="sheet-actions">
          <Button onClick={() => setDelOpen(false)}>취소</Button>
          <Button
            variant="danger"
            disabled={delName.trim() !== session.name}
            loading={delBusy}
            onClick={() => void doDelete()}
          >
            영구 삭제
          </Button>
        </div>
      </Sheet>
    </div>
  );
}

function QrSvg({ url }: { url: string }) {
  const svg = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(url);
    qr.make();
    return qr.createSvgTag({ cellSize: 5, margin: 2, scalable: true });
  }, [url]);
  return <div className="adm-qr" dangerouslySetInnerHTML={{ __html: svg }} />;
}
