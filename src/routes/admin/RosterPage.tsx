// 명단·배정 — 파일 업로드/직접 추가/검색 + 랜덤 배정/팀 select/CSV 내보내기
import { DragEvent, FormEvent, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  addPerson, applyAssign, clearPeople, mergeRoster,
  removePerson, resetAssign, setPersonSno, setTeamCount,
} from '@/api';
import { parseRosterFile } from '@/lib/xlsx';
import { errMsg } from '@/lib/errors';
import { toast } from '@/hooks/useStore';
import { useProfile } from '@/hooks/useProfile';
import { useSessionData } from '@/hooks/useSessionData';
import {
  Button, ConfirmSheet, Dot, EmptyState, SaveButton,
  SectionHead, Sheet, TextInput, useSaveField,
} from '@/components/ui';
import { downloadCsv, teamColor } from '@/lib/format';
import type { Person, SessionRow, Team } from '@/types/domain';
import './admin.css';

export default function RosterPage() {
  const { data } = useProfile();
  if (!data?.session) return null;
  return <Roster key={data.session.id} session={data.session} />;
}

function Roster({ session }: { session: SessionRow }) {
  const qc = useQueryClient();
  const sid = session.id;
  const teamCount = session.team_count;
  const indiv = teamCount === 0;
  const { data: sd } = useSessionData(session);
  const people = sd?.people ?? [];
  const teams = sd?.teams ?? [];

  const invalidate = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['sessionData', sid] }),
      qc.invalidateQueries({ queryKey: ['profile'] }),
    ]);

  /* ---------- 명단 ---------- */
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [query, setQuery] = useState('');
  const [addName, setAddName] = useState('');
  const [addSno, setAddSno] = useState('');
  const [addDept, setAddDept] = useState('');
  const [addBusy, setAddBusy] = useState(false);
  const [snoTarget, setSnoTarget] = useState<Person | null>(null);
  const [snoInput, setSnoInput] = useState('');
  const [snoBusy, setSnoBusy] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<Person | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const handleFile = async (f: File | undefined | null) => {
    if (!f) return;
    setUploading(true);
    try {
      const entries = await parseRosterFile(f);
      if (!entries.length) { toast('파일에서 이름을 찾지 못했습니다.', 'error'); return; }
      const r = await mergeRoster(entries);
      await invalidate();
      toast(`명단 반영 완료 — 유지 ${r.kept} · 추가 ${r.added} · 제거 ${r.removed}`, 'success');
    } catch (e) {
      toast(errMsg(e), 'error');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    void handleFile(e.dataTransfer.files?.[0]);
  };

  const submitAdd = async (e: FormEvent) => {
    e.preventDefault();
    if (!addName.trim()) { toast('이름을 입력하세요.', 'error'); return; }
    setAddBusy(true);
    try {
      await addPerson(addName.trim(), addDept.trim(), addSno.trim());
      await invalidate();
      toast(`'${addName.trim()}' 추가됨`, 'success');
      setAddName(''); setAddSno(''); setAddDept('');
    } catch (e2) {
      toast(errMsg(e2), 'error');
    } finally {
      setAddBusy(false);
    }
  };

  const saveSno = async () => {
    if (!snoTarget) return;
    setSnoBusy(true);
    try {
      await setPersonSno(snoTarget.id, snoInput.trim());
      await invalidate();
      toast('학번을 저장했습니다', 'success');
      setSnoTarget(null);
    } catch (e) {
      toast(errMsg(e), 'error');
    } finally {
      setSnoBusy(false);
    }
  };

  const q = query.trim();
  const filtered = q
    ? people.filter((p) => p.name.includes(q) || p.student_no.includes(q) || p.dept.includes(q))
    : people;

  /* ---------- 배정 ---------- */
  const teamName = (i: number) => teams.find((t) => t.idx === i)?.name || `${i + 1}팀`;

  const countField = useSaveField(String(teamCount), async (v) => {
    const n = Math.max(0, Math.min(99, parseInt(v, 10) || 0));
    await setTeamCount(n);
    await invalidate();
  });

  const setPersonTeam = async (p: Person, v: string) => {
    const team = v === '' ? null : Number(v);
    try {
      // 수동 지정은 자동 고정(pin=team), '자동'으로 되돌리면 고정 해제
      await applyAssign([{ id: p.id, team, pin: team }]);
      await invalidate();
    } catch (e) {
      toast(errMsg(e), 'error');
    }
  };

  const unpin = async (p: Person) => {
    try {
      await applyAssign([{ id: p.id, team: p.team, pin: null }]);
      await invalidate();
    } catch (e) {
      toast(errMsg(e), 'error');
    }
  };

  const randomAssign = async () => {
    if (!teamCount) { toast('팀 수가 0(개별활동 모드)입니다 — 팀 수를 먼저 정하세요.', 'error'); return; }
    // pin 고정 인원 유지, 미고정 인원 셔플 후 가장 적은 팀부터 채움 (legacy와 동일)
    const assign = people.map((p) => {
      const pin = p.pin != null && p.pin < teamCount ? p.pin : null;
      return { id: p.id, team: pin, pin };
    });
    const counts: number[] = Array(teamCount).fill(0);
    assign.forEach((a) => { if (a.team != null) counts[a.team]++; });
    const pool = assign.filter((a) => a.team == null);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    for (const a of pool) {
      const min = Math.min(...counts);
      const cands = counts.flatMap((c, k) => (c === min ? [k] : []));
      a.team = cands[Math.floor(Math.random() * cands.length)];
      counts[a.team]++;
    }
    try {
      await applyAssign(assign);
      await invalidate();
      toast(`랜덤 배정 완료 — ${pool.length}명 배정, 고정 ${assign.length - pool.length}명 유지`, 'success');
    } catch (e) {
      toast(errMsg(e), 'error');
    }
  };

  const exportCsv = () => {
    const rows: unknown[][] = [['팀', '이름', '학번', '소속', 'API 키', 'PPT', '서비스', '메모']];
    const teamRow = (t: Team | undefined, p: Person, label: string) =>
      rows.push([label, p.name, p.student_no, p.dept, t?.api || '', t?.ppt || '', t?.link || '', t?.memo || '']);
    for (let i = 0; i < teamCount; i++) {
      const t = teams.find((x) => x.idx === i);
      for (const p of people.filter((x) => x.team === i)) teamRow(t, p, teamName(i));
    }
    for (const p of people.filter((x) => x.team == null)) teamRow(undefined, p, '미배정');
    downloadCsv(rows, `팀배정_${new Date().toISOString().slice(0, 10)}.csv`);
    toast('CSV 다운로드 완료 (엑셀에서 열립니다)', 'success');
  };

  const assigned = people.filter((p) => p.team != null).length;
  const pinned = people.filter((p) => p.pin != null).length;

  return (
    <div>
      {/* ---------- (1) 명단 ---------- */}
      <SectionHead
        title="명단"
        sub={`총 ${people.length}명`}
        right={
          <Button size="sm" variant="danger" disabled={!people.length} onClick={() => setConfirmClear(true)}>
            전체 삭제
          </Button>
        }
      />
      <div
        className={'adm-dropzone' + (dragOver ? ' is-over' : '')}
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        {uploading
          ? '명단 반영 중…'
          : <><strong>엑셀(.xlsx)/CSV 업로드</strong> — 클릭 또는 파일을 끌어다 놓으세요</>}
      </div>
      <p className="adm-note is-warn">
        주의: 업로드한 목록에 없는 기존 인원은 명단에서 제거되며, 그 학생의 평가·퀴즈 포인트·메시지 기록도 함께 삭제됩니다. (같은 이름은 유지되고 배정도 보존됩니다)
      </p>
      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.xls,.csv,.txt"
        hidden
        onChange={(e) => void handleFile(e.target.files?.[0])}
      />

      <form className="adm-toolbar" onSubmit={submitAdd}>
        <TextInput value={addName} onChange={(e) => setAddName(e.target.value)} placeholder="이름" style={{ maxWidth: 120 }} />
        <TextInput value={addSno} onChange={(e) => setAddSno(e.target.value)} placeholder="학번" style={{ maxWidth: 130 }} autoComplete="off" />
        <TextInput value={addDept} onChange={(e) => setAddDept(e.target.value)} placeholder="소속 (선택)" style={{ maxWidth: 160 }} />
        <Button size="sm" type="submit" loading={addBusy}>직접 추가</Button>
      </form>

      <div className="adm-toolbar">
        <TextInput
          className="adm-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="이름·학번·소속 검색"
        />
        <span className="adm-stats">
          {q ? `${filtered.length}명 일치` : `미배정 ${people.length - assigned}명${pinned ? ` · 고정 ${pinned}명` : ''}`}
        </span>
      </div>

      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead>
            <tr>
              <th>이름</th>
              <th>학번</th>
              <th>소속</th>
              {!indiv && <th>팀</th>}
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.id}>
                <td className="adm-cell-name">
                  {!indiv && p.team != null && <Dot color={teamColor(p.team)} />} {p.name}
                </td>
                <td>
                  <button
                    className="adm-cell-btn"
                    title="학번 수정"
                    onClick={() => { setSnoTarget(p); setSnoInput(p.student_no); }}
                  >
                    {p.student_no || '학번 없음'}
                  </button>
                </td>
                <td className="adm-cell-muted">{p.dept}</td>
                {!indiv && (
                  <td>
                    <select
                      className="adm-team-select"
                      value={p.team == null ? '' : String(p.team)}
                      onChange={(e) => void setPersonTeam(p, e.target.value)}
                    >
                      <option value="">자동</option>
                      {Array.from({ length: teamCount }, (_, i) => (
                        <option key={i} value={i}>{teamName(i)}</option>
                      ))}
                    </select>
                    {p.pin != null && (
                      <button className="adm-pin" title="고정 해제" onClick={() => void unpin(p)}>고정 ×</button>
                    )}
                  </td>
                )}
                <td>
                  <div className="adm-row-actions">
                    <button className="adm-cell-btn is-danger" onClick={() => setRemoveTarget(p)}>삭제</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <EmptyState>{people.length ? '검색 결과가 없습니다.' : '명단이 비어 있습니다. 파일을 올리거나 직접 추가하세요.'}</EmptyState>
        )}
      </div>

      {/* ---------- (2) 배정 ---------- */}
      <SectionHead
        title="배정"
        sub={indiv ? '개별활동 모드' : `${teamCount}팀 · ${assigned}명 배정`}
        right={<Button size="sm" onClick={exportCsv} disabled={!people.length}>CSV 내보내기</Button>}
      />
      <div className="adm-field-row" style={{ maxWidth: 360 }}>
        <label className="adm-stats" htmlFor="adm-team-count">팀 수</label>
        <TextInput
          id="adm-team-count"
          type="number"
          min={0}
          max={99}
          className="is-short"
          value={countField.value}
          onChange={(e) => countField.onChange(e.target.value)}
        />
        <SaveButton state={countField.state} onSave={countField.onSave} />
      </div>
      <p className="adm-note">팀 수를 0으로 두면 팀 없이 각자 활동하는 개별활동 모드가 됩니다.</p>

      {indiv ? (
        <EmptyState>개별활동 모드입니다 — 팀 배정 없이 각자 결과물을 제출합니다.</EmptyState>
      ) : (
        <>
          <div className="adm-actions" style={{ marginTop: 'var(--space-3)' }}>
            <Button variant="primary" onClick={() => void randomAssign()} disabled={!people.length}>랜덤 배정</Button>
            <Button onClick={() => setConfirmReset(true)} disabled={!assigned}>배정 초기화</Button>
          </div>
          <p className="adm-note">랜덤 배정은 고정 인원을 제외하고 섞어 가장 인원이 적은 팀부터 채웁니다. 팀을 직접 지정하면 자동으로 고정됩니다.</p>
          <div className="adm-chips">
            {Array.from({ length: teamCount }, (_, i) => (
              <span key={i} className="adm-chip">
                <Dot color={teamColor(i)} /> {teamName(i)}
                <span className="adm-chip-cnt">{people.filter((p) => p.team === i).length}명</span>
              </span>
            ))}
            <span className="adm-chip">
              미배정 <span className="adm-chip-cnt">{people.length - assigned}명</span>
            </span>
          </div>
        </>
      )}

      {/* ---------- 시트/확인 ---------- */}
      <Sheet open={!!snoTarget} onClose={() => setSnoTarget(null)} title={`${snoTarget?.name ?? ''} 학번 수정`}>
        <TextInput
          value={snoInput}
          onChange={(e) => setSnoInput(e.target.value)}
          placeholder="학번"
          autoComplete="off"
        />
        <div className="sheet-actions">
          <Button onClick={() => setSnoTarget(null)}>취소</Button>
          <Button variant="primary" loading={snoBusy} onClick={() => void saveSno()}>저장</Button>
        </div>
      </Sheet>

      <ConfirmSheet
        open={!!removeTarget}
        onClose={() => setRemoveTarget(null)}
        title="인원 삭제"
        desc={`'${removeTarget?.name ?? ''}'을(를) 명단에서 삭제할까요?`}
        okLabel="삭제"
        danger
        onOk={async () => {
          if (!removeTarget) return;
          try {
            await removePerson(removeTarget.id);
            await invalidate();
            toast('삭제했습니다', 'success');
          } catch (e) {
            toast(errMsg(e), 'error');
          }
        }}
      />

      <ConfirmSheet
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        title="명단 전체 삭제"
        desc={`명단의 ${people.length}명을 모두 삭제합니다. 되돌릴 수 없습니다.`}
        okLabel="전체 삭제"
        danger
        onOk={async () => {
          try {
            await clearPeople();
            await invalidate();
            toast('명단을 모두 삭제했습니다', 'success');
          } catch (e) {
            toast(errMsg(e), 'error');
          }
        }}
      />

      <ConfirmSheet
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="배정 초기화"
        desc="모든 인원의 팀 배정과 고정을 해제합니다."
        okLabel="초기화"
        danger
        onOk={async () => {
          try {
            await resetAssign();
            await invalidate();
            toast('배정을 초기화했습니다', 'success');
          } catch (e) {
            toast(errMsg(e), 'error');
          }
        }}
      />
    </div>
  );
}
