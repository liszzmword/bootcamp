// 평가 관리 — 설정(학생 참여·가중치·평가자 코드·조교), 결과 테이블, 초기화/CSV
import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getJudgeCode, removeJudge, resetEvalScores, setEvalConfig, setJudgeCode } from '@/api';
import { useEvaluations, useJudges } from '@/hooks/useData';
import { useProfile } from '@/hooks/useProfile';
import { useSessionData } from '@/hooks/useSessionData';
import { toast } from '@/hooks/useStore';
import { errMsg } from '@/lib/errors';
import { downloadCsv, fmtDate, teamColor } from '@/lib/format';
import {
  Badge, Button, ConfirmSheet, Dot, EmptyState, SaveButton, SectionHead, Sheet, TextInput, useSaveField,
} from '@/components/ui';
import { computeEvalStats } from '@/types/domain';
import type { Evaluation, Judge, SessionRow } from '@/types/domain';
import './adminlive.css';

export default function EvalPage() {
  const { data, isLoading } = useProfile();
  const session = data?.session ?? null;
  if (isLoading) return <EmptyState>불러오는 중…</EmptyState>;
  if (!session) return <EmptyState>세션에 입장한 뒤 이용할 수 있습니다.</EmptyState>;
  return <EvalBody session={session} />;
}

function EvalBody({ session }: { session: SessionRow }) {
  const sid = session.id;
  const qc = useQueryClient();
  const { data: sd } = useSessionData(session);
  const teams = sd?.teams ?? [];
  const people = sd?.people ?? [];
  const evals = useEvaluations(sid).data ?? [];
  const judges = useJudges(sid).data ?? [];

  const act = async (fn: () => Promise<unknown>, keys: unknown[][]) => {
    try {
      await fn();
      await Promise.all(keys.map((k) => qc.invalidateQueries({ queryKey: k })));
    } catch (e) {
      toast(errMsg(e), 'error');
    }
  };

  /* ---------- 설정: 가중치 ---------- */
  const [weight, setWeight] = useState(session.judge_weight);
  const [wDirty, setWDirty] = useState(false);
  useEffect(() => {
    if (!wDirty) setWeight(session.judge_weight);
  }, [session.judge_weight, wDirty]);
  const saveWeight = () => act(async () => {
    await setEvalConfig(session.student_eval_enabled, weight);
    setWDirty(false);
    toast('평가 가중치를 저장했습니다', 'success');
  }, [['profile']]);

  /* ---------- 설정: 평가자 코드 ---------- */
  const codeQ = useQuery({
    queryKey: ['judgeCode', sid],
    queryFn: () => getJudgeCode(sid),
  });
  const codeField = useSaveField(codeQ.data?.code ?? '', async (v) => {
    await setJudgeCode(v.trim());
    await qc.invalidateQueries({ queryKey: ['judgeCode', sid] });
  });

  /* ---------- 결과 ---------- */
  const [byTotal, setByTotal] = useState(true);
  const rows = useMemo(() => {
    const r = teams.map((t) => ({ team: t, stats: computeEvalStats(evals, t.idx, session.judge_weight) }));
    if (byTotal) r.sort((a, b) => (b.stats.total ?? -1) - (a.stats.total ?? -1));
    return r;
  }, [teams, evals, session.judge_weight, byTotal]);

  const teamName = (i: number) => teams.find((t) => t.idx === i)?.name ?? `팀 ${i + 1}`;
  const evaluatorName = (e: Evaluation): string => {
    if (e.evaluator_judge != null) return `${judges.find((j) => j.id === e.evaluator_judge)?.name ?? '조교'} (조교)`;
    if (e.evaluator_person != null) {
      const p = people.find((x) => x.id === e.evaluator_person);
      const from = e.from_team != null ? ` · ${teamName(e.from_team)}` : '';
      return `${p?.name ?? '학생'}${from}`;
    }
    if (e.evaluator_uid != null) return '관리자';
    return '?';
  };

  const [detail, setDetail] = useState<number | null>(null);
  const detailRows = useMemo(
    () => (detail == null
      ? []
      : evals
        .filter((e) => e.to_team === detail && (e.score != null || e.comment.trim() !== ''))
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at))),
    [detail, evals],
  );

  /* ---------- 도구 ---------- */
  const [resetOpen, setResetOpen] = useState(false);
  const [rmJudge, setRmJudge] = useState<Judge | null>(null);

  const downloadEvalCsv = () => {
    const w = session.judge_weight;
    const out: unknown[][] = [['팀', `심사위원 환산(${w})`, `학생 환산(${100 - w})`, '총점(100)', '심사위원 수', '학생 수']];
    for (const t of teams) {
      const s = computeEvalStats(evals, t.idx, w);
      out.push([
        t.name,
        s.judgeAvg == null ? '' : ((s.judgeAvg * w) / 10).toFixed(2),
        s.studentAvg == null ? '' : ((s.studentAvg * (100 - w)) / 10).toFixed(2),
        s.total == null ? '' : s.total.toFixed(2),
        s.judgeCount,
        s.studentCount,
      ]);
    }
    out.push([]);
    out.push(['대상 팀', '평가자', '점수', '코멘트', '수정 시각']);
    for (const t of teams) {
      for (const e of evals.filter((x) => x.to_team === t.idx && (x.score != null || x.comment.trim() !== ''))) {
        out.push([t.name, evaluatorName(e), e.score ?? '', e.comment, fmtDate(e.updated_at)]);
      }
    }
    downloadCsv(out, `평가_${new Date().toISOString().slice(0, 10)}.csv`);
    toast('평가 CSV를 내려받았습니다', 'success');
  };

  return (
    <div className="al-page">
      <SectionHead title="평가 관리" sub={session.name} />
      <div className="al-grid">
        {/* 설정 카드 */}
        <div className="al-card">
          <h3 className="al-card-title">평가 설정</h3>
          <label className="al-check">
            <input
              type="checkbox"
              checked={session.student_eval_enabled}
              onChange={(e) => act(() => setEvalConfig(e.target.checked, session.judge_weight), [['profile']])}
            />
            학생 평가 참여 허용
          </label>
          <div className="al-row">
            <input
              type="range"
              className="al-range"
              min={0}
              max={100}
              aria-label="심사위원 가중치"
              value={weight}
              onChange={(e) => { setWeight(Number(e.target.value)); setWDirty(true); }}
            />
            <TextInput
              type="number"
              min={0}
              max={100}
              value={weight}
              style={{ width: 76 }}
              onChange={(e) => {
                setWeight(Math.max(0, Math.min(100, Number(e.target.value) || 0)));
                setWDirty(true);
              }}
            />
            <Button size="sm" variant="primary" disabled={weight === session.judge_weight} onClick={saveWeight}>저장</Button>
          </div>
          <p className="al-muted">총점 반영 — 심사위원 {weight}% : 학생 {100 - weight}%</p>
        </div>

        {/* 평가자(조교) 카드 */}
        <div className="al-card">
          <h3 className="al-card-title">평가자(조교)</h3>
          <div className="al-row">
            <TextInput
              value={codeField.value}
              onChange={(e) => codeField.onChange(e.target.value)}
              placeholder="평가자 입장 코드"
              autoComplete="off"
              style={{ flex: 1, minWidth: 140 }}
            />
            <SaveButton state={codeField.state} onSave={codeField.onSave} />
          </div>
          <p className="al-muted">조교는 평가자 로그인 화면에서 이 코드로 입장합니다. 코드만 알면 누구나 평가자가 되니 조교에게만 전달하고, 아래 목록에 모르는 이름이 보이면 즉시 내보내세요.</p>
          {judges.length === 0 ? (
            <EmptyState>아직 입장한 조교가 없습니다.</EmptyState>
          ) : (
            <div className="al-hist">
              {judges.map((j) => {
                const done = new Set(
                  evals.filter((e) => e.evaluator_judge === j.id && e.score != null).map((e) => e.to_team),
                ).size;
                return (
                  <div key={j.id} className="al-hist-item">
                    <div className="al-row">
                      <strong>{j.name}</strong>
                      <span className="al-muted">{done}/{teams.length}팀 제출</span>
                      <span style={{ marginLeft: 'auto' }}>
                        <Button size="sm" variant="ghost" onClick={() => setRmJudge(j)}>내보내기</Button>
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 결과 */}
      <SectionHead
        title="평가 결과"
        sub={`심사위원 ${session.judge_weight}% · 학생 ${100 - session.judge_weight}%`}
        right={(
          <span className="al-row">
            <Button size="sm" onClick={() => setByTotal((v) => !v)}>{byTotal ? '팀 순서로' : '총점순으로'}</Button>
            <Button size="sm" onClick={downloadEvalCsv}>평가 CSV</Button>
            <Button size="sm" variant="danger" onClick={() => setResetOpen(true)}>점수 초기화</Button>
          </span>
        )}
      />
      {teams.length === 0 ? (
        <EmptyState>
          {session.team_count === 0 ? '개별활동 모드에서는 팀 평가가 없습니다.' : '팀이 없습니다.'}
        </EmptyState>
      ) : (
        <div className="al-scroll">
          <table className="al-table">
            <thead>
              <tr><th>팀</th><th>총점</th><th>심사위원 평균</th><th>학생 평균</th><th>건수</th></tr>
            </thead>
            <tbody>
              {rows.map(({ team, stats }) => (
                <tr key={team.idx} className="al-clickable" onClick={() => setDetail(team.idx)}>
                  <td><span className="al-row"><Dot color={teamColor(team.idx)} />{team.name}</span></td>
                  <td className="al-num"><strong>{stats.total == null ? '—' : stats.total.toFixed(1)}</strong></td>
                  <td className="al-num">{stats.judgeAvg == null ? '—' : `${stats.judgeAvg.toFixed(2)} (${stats.judgeCount})`}</td>
                  <td className="al-num">{stats.studentAvg == null ? '—' : `${stats.studentAvg.toFixed(2)} (${stats.studentCount})`}</td>
                  <td className="al-num">{stats.judgeCount + stats.studentCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 팀 상세 */}
      <Sheet
        open={detail != null}
        onClose={() => setDetail(null)}
        title={detail == null ? undefined : `${teamName(detail)} 평가 상세`}
      >
        {detailRows.length === 0 ? (
          <EmptyState>아직 제출된 평가가 없습니다.</EmptyState>
        ) : (
          <div className="al-hist">
            {detailRows.map((e) => (
              <div key={e.id} className="al-hist-item">
                <div className="al-hist-meta">
                  <strong>{evaluatorName(e)}</strong>
                  {e.score != null && <Badge tone="success">{e.score}점</Badge>}
                  <span className="al-muted">{fmtDate(e.updated_at)}</span>
                </div>
                {e.comment.trim() !== '' && <p className="al-pre">{e.comment}</p>}
              </div>
            ))}
          </div>
        )}
      </Sheet>

      {/* 점수 초기화 */}
      <ConfirmSheet
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        title="점수 초기화"
        desc={'이 세션의 모든 평가 점수와 코멘트가 삭제됩니다.\n되돌릴 수 없습니다.'}
        okLabel="초기화"
        danger
        onOk={() => act(async () => {
          await resetEvalScores();
          toast('평가 점수를 초기화했습니다', 'success');
        }, [['evaluations', sid]])}
      />

      {/* 조교 내보내기 */}
      <ConfirmSheet
        open={rmJudge != null}
        onClose={() => setRmJudge(null)}
        title="조교 내보내기"
        desc={rmJudge ? `'${rmJudge.name}' 조교를 평가자 목록에서 제거할까요?` : undefined}
        okLabel="내보내기"
        danger
        onOk={() => act(async () => {
          if (rmJudge) await removeJudge(rmJudge.id);
        }, [['judges', sid]])}
      />
    </div>
  );
}
