// 내 팀 탭 — 팀 카드(링크/메모/PPT 파일/API 키/받은 피드백) · 개별 모드는 내 제출 폼
import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { deletePpt, pptDownloadUrl, setMyWork, updateTeamField, uploadPpt } from '@/api';
import { Button, ConfirmSheet, Dot, EmptyState, SectionHead, TextArea, TextInput, SaveButton, useSaveField } from '@/components/ui';
import { errMsg } from '@/lib/errors';
import { fmtDate, fmtSize, isHttpUrl, normalizeUrl, teamColor } from '@/lib/format';
import { toast } from '@/hooks/useStore';
import { useProfile } from '@/hooks/useProfile';
import { useSessionData } from '@/hooks/useSessionData';
import type { Feedback, Person, SessionRow, Team } from '@/types/domain';

const MAX_PPT = 50 * 1024 * 1024; // 50MB

/** 링크 열기 버튼 — 저장 전 입력값도 normalizeUrl 보정해 연다 */
function OpenLink({ value }: { value: string }) {
  const url = normalizeUrl(value);
  if (!isHttpUrl(url)) return null;
  return (
    <a className="open-link" href={url} target="_blank" rel="noreferrer noopener">열기</a>
  );
}

function LinkField({ label, field, placeholder }: {
  label: string;
  field: ReturnType<typeof useSaveField>;
  placeholder?: string;
}) {
  return (
    <div className="team-field">
      <div className="team-field-head">
        <label>{label}</label>
        <OpenLink value={field.value} />
      </div>
      <div className="team-field-row">
        <TextInput value={field.value} placeholder={placeholder}
          onChange={(e) => field.onChange(e.target.value)} inputMode="url" autoComplete="off" />
        <SaveButton state={field.state} onSave={field.onSave} />
      </div>
    </div>
  );
}

/* ---------- 팀 모드: 내 팀 카드 ---------- */
function TeamCard({ session, team, members, feedback }: {
  session: SessionRow; team: Team; members: Person[]; feedback: Feedback[];
}) {
  const qc = useQueryClient();
  const sid = session.id;
  const invalidate = () => qc.invalidateQueries({ queryKey: ['sessionData', sid] });

  const pptF = useSaveField(team.ppt, async (v) => {
    await updateTeamField(team.idx, 'ppt', normalizeUrl(v));
    invalidate();
  });
  const linkF = useSaveField(team.link, async (v) => {
    await updateTeamField(team.idx, 'link', normalizeUrl(v));
    invalidate();
  });
  const memoF = useSaveField(team.memo, async (v) => {
    await updateTeamField(team.idx, 'memo', v);
    invalidate();
  });

  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [askDelete, setAskDelete] = useState(false);
  const [showApi, setShowApi] = useState(false);

  const onPick = async (f: File | null) => {
    if (!f) return;
    if (f.size > MAX_PPT) {
      toast('파일이 50MB를 초과합니다. 더 작은 파일로 올려주세요.', 'error');
      return;
    }
    setUploading(true);
    try {
      await uploadPpt(sid, team.idx, f);
      invalidate();
      toast('발표 파일을 올렸습니다.', 'success');
    } catch (e) {
      toast(errMsg(e), 'error');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const copyApi = async () => {
    if (!team.api) return;
    try {
      await navigator.clipboard.writeText(team.api);
      toast('API 키를 복사했습니다.', 'success');
    } catch {
      toast('복사에 실패했습니다 — 길게 눌러 직접 복사하세요.', 'error');
    }
  };

  const myFeedback = feedback.filter((f) => f.to_team === team.idx);

  return (
    <div className="st-card team-card">
      <div className="team-title">
        <Dot color={teamColor(team.idx)} />
        <h3>{team.name}</h3>
      </div>
      <div className="chip-row">
        {members.length === 0 && <span className="muted">팀원이 없습니다.</span>}
        {members.map((m) => <span key={m.id} className="chip">{m.name}</span>)}
      </div>

      <LinkField label="PPT 링크" field={pptF} placeholder="https:// 발표자료 링크" />
      <LinkField label="서비스 링크" field={linkF} placeholder="https:// 배포 주소" />
      <div className="team-field">
        <div className="team-field-head"><label>메모</label></div>
        <div className="team-field-row">
          <TextArea value={memoF.value} placeholder="팀 메모 (전체 공개)"
            onChange={(e) => memoF.onChange(e.target.value)} rows={3} />
          <SaveButton state={memoF.state} onSave={memoF.onSave} />
        </div>
      </div>

      <div className="team-field">
        <div className="team-field-head"><label>PPT 파일</label><span className="muted">최대 50MB</span></div>
        {team.ppt_file ? (
          <div className="file-row">
            <div className="file-info">
              <span className="file-name">{team.ppt_file.name}</span>
              <span className="muted">{fmtSize(team.ppt_file.size)}{team.ppt_file.at ? ` · ${fmtDate(team.ppt_file.at)}` : ''}</span>
            </div>
            <div className="file-actions">
              <a className="open-link" href={pptDownloadUrl(sid, team.idx, team.ppt_file)}>다운로드</a>
              <Button size="sm" loading={uploading} onClick={() => fileRef.current?.click()}>교체</Button>
              <Button size="sm" variant="danger" onClick={() => setAskDelete(true)}>삭제</Button>
            </div>
          </div>
        ) : (
          <Button loading={uploading} onClick={() => fileRef.current?.click()}>파일 올리기</Button>
        )}
        <input ref={fileRef} type="file" hidden
          onChange={(e) => void onPick(e.target.files?.[0] ?? null)} />
      </div>

      <div className="team-field">
        <div className="team-field-head"><label>API 키</label></div>
        {team.api ? (
          <div className="api-row">
            <code className="api-value">{showApi ? team.api : '••••••••••••••••'}</code>
            <Button size="sm" onClick={() => setShowApi((s) => !s)}>{showApi ? '가리기' : '열람'}</Button>
            <Button size="sm" onClick={copyApi}>복사</Button>
          </div>
        ) : (
          <p className="muted">발급된 API 키가 없습니다.</p>
        )}
      </div>

      <div className="team-field">
        <div className="team-field-head"><label>받은 익명 피드백</label></div>
        {myFeedback.length === 0 && <p className="muted">아직 받은 피드백이 없습니다.</p>}
        <ul className="feedback-list">
          {myFeedback.map((f, i) => (
            <li key={i} className="feedback-item">
              <p>{f.comment}</p>
              <span className="muted">{fmtDate(f.updated_at)}</span>
            </li>
          ))}
        </ul>
      </div>

      <ConfirmSheet open={askDelete} onClose={() => setAskDelete(false)}
        title="발표 파일 삭제" desc={`'${team.ppt_file?.name ?? ''}' 파일을 삭제할까요?`}
        okLabel="삭제" danger
        onOk={async () => {
          try {
            await deletePpt(sid, team.idx, team.ppt_file);
            invalidate();
            toast('파일을 삭제했습니다.', 'success');
          } catch (e) {
            toast(errMsg(e), 'error');
          }
        }} />
    </div>
  );
}

/* ---------- 개별활동 모드: 내 제출 폼 + 전체 제출 목록 ---------- */
function IndividualSection({ session, me, people }: {
  session: SessionRow; me: Person; people: Person[];
}) {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['sessionData', session.id] });

  const linkF = useSaveField(me.work_link, async (v) => {
    await setMyWork(normalizeUrl(v), memoF.value);
    invalidate();
  });
  const memoF = useSaveField(me.work_memo, async (v) => {
    await setMyWork(normalizeUrl(linkF.value), v);
    invalidate();
  });

  const submitted = people.filter((p) => p.work_link || p.work_memo);

  return (
    <>
      <SectionHead title="내 제출" sub="개별활동" />
      <div className="st-card">
        <LinkField label="결과물 링크" field={linkF} placeholder="https:// 결과물 주소" />
        <div className="team-field">
          <div className="team-field-head"><label>메모</label></div>
          <div className="team-field-row">
            <TextArea value={memoF.value} placeholder="한 줄 소개 등 (전체 공개)"
              onChange={(e) => memoF.onChange(e.target.value)} rows={3} />
            <SaveButton state={memoF.state} onSave={memoF.onSave} />
          </div>
        </div>
      </div>

      <SectionHead title="전체 제출" sub={`${submitted.length}/${people.length}명`} />
      {submitted.length === 0 && <EmptyState>아직 제출한 사람이 없습니다.</EmptyState>}
      <ul className="submit-list">
        {submitted.map((p) => (
          <li key={p.id} className="st-card submit-item">
            <div className="submit-head">
              <strong>{p.name}</strong>
              {p.id === me.id && <span className="muted">(나)</span>}
              <OpenLink value={p.work_link} />
            </div>
            {p.work_memo && <p className="submit-memo">{p.work_memo}</p>}
          </li>
        ))}
      </ul>
    </>
  );
}

/* ---------- 메인 ---------- */
export default function MyTeamTab() {
  const { data: prof } = useProfile();
  const session = prof?.session ?? null;
  const { data: sd } = useSessionData(session);

  if (!session) return null;

  const people = sd?.people ?? [];
  const teams = sd?.teams ?? [];
  const feedback = sd?.feedback ?? [];
  const me = people.find((p) => p.id === prof?.profile?.person_id) ?? null;

  if (session.team_count === 0) {
    if (!me) return <EmptyState>내 정보를 불러오는 중입니다…</EmptyState>;
    return <IndividualSection session={session} me={me} people={people} />;
  }

  const myTeam = me?.team != null ? teams.find((t) => t.idx === me.team) ?? null : null;
  const otherTeams = teams.filter((t) => t.idx !== myTeam?.idx);

  return (
    <div className="team-tab">
      <SectionHead title="내 팀" />
      {myTeam ? (
        <TeamCard session={session} team={myTeam}
          members={people.filter((p) => p.team === myTeam.idx)} feedback={feedback} />
      ) : (
        <EmptyState>아직 팀이 배정되지 않았습니다. 관리자에게 문의하세요.</EmptyState>
      )}

      {otherTeams.length > 0 && (
        <details className="other-teams">
          <summary>다른 팀 보기 ({otherTeams.length}팀)</summary>
          <ul className="other-team-list">
            {otherTeams.map((t) => {
              const members = people.filter((p) => p.team === t.idx);
              return (
                <li key={t.idx} className="st-card other-team-item">
                  <div className="team-title">
                    <Dot color={teamColor(t.idx)} />
                    <strong>{t.name}</strong>
                    <OpenLink value={t.link} />
                  </div>
                  <p className="muted">{members.length ? members.map((m) => m.name).join(', ') : '팀원 없음'}</p>
                  {t.memo && <p className="submit-memo">{t.memo}</p>}
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </div>
  );
}
