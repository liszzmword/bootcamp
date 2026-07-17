// 공통 UI 프리미티브 — semantic 토큰만 참조
import { ReactNode, ButtonHTMLAttributes, InputHTMLAttributes, TextareaHTMLAttributes, useEffect, useRef, useState } from 'react';
import { useStore } from '@/hooks/useStore';
import { errMsg } from '@/lib/errors';
import './ui.css';

/* ---------- Button ---------- */
interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}
export function Button({ variant = 'secondary', size = 'md', loading, children, disabled, className = '', ...rest }: BtnProps) {
  return (
    <button
      className={`btn btn-${variant} btn-${size} ${loading ? 'btn-loading' : ''} ${className}`}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && <span className="spinner" aria-hidden />}
      <span className="btn-label">{children}</span>
    </button>
  );
}

/* ---------- Input / Textarea ---------- */
export function TextInput({ className = '', ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`field ${className}`} {...rest} />;
}
export function TextArea({ className = '', ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`field ${className}`} {...rest} />;
}

/* ---------- SaveField: idle→dirty→saving→saved→error (legacy 저장 버튼 UX 계승) ---------- */
export function useSaveField(initial: string, save: (v: string) => Promise<void>) {
  const [value, setValue] = useState(initial);
  const [state, setState] = useState<'idle' | 'dirty' | 'saving' | 'saved' | 'error'>('idle');
  const initialRef = useRef(initial);
  // 서버값 변경은 dirty가 아닐 때만 반영 (입력 보호)
  useEffect(() => {
    if (state === 'idle' || state === 'saved') {
      setValue(initial);
      initialRef.current = initial;
    }
  }, [initial]); // eslint-disable-line react-hooks/exhaustive-deps
  const onChange = (v: string) => { setValue(v); setState(v === initialRef.current ? 'idle' : 'dirty'); };
  const onSave = async () => {
    setState('saving');
    try {
      await save(value);
      initialRef.current = value;
      setState('saved');
    } catch (e) {
      setState('error');
      useStore.getState().toast(errMsg(e), 'error');
    }
  };
  return { value, state, onChange, onSave };
}

export function SaveButton({ state, onSave }: { state: string; onSave: () => void }) {
  return (
    <Button
      size="sm"
      className="save-btn"
      disabled={state === 'idle' || state === 'saving'}
      loading={state === 'saving'}
      variant={state === 'saved' ? 'ghost' : 'secondary'}
      onClick={onSave}
    >
      {state === 'saved' ? '✓ 저장됨' : '저장'}
    </Button>
  );
}

/* ---------- Toast 스택 ---------- */
export function ToastStack() {
  const toasts = useStore((s) => s.toasts);
  const dismiss = useStore((s) => s.dismissToast);
  return (
    <div className="toast-stack" role="status">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`} onClick={() => dismiss(t.id)}>
          {t.text}
        </div>
      ))}
    </div>
  );
}

/* ---------- Sheet (모바일 바텀시트 / 데스크톱 모달 겸용) ---------- */
export function Sheet({ open, onClose, title, children }: {
  open: boolean; onClose: () => void; title?: string; children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="sheet" onCancel={(e) => { e.preventDefault(); onClose(); }}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}>
      <div className="sheet-body">
        <div className="sheet-grab" aria-hidden />
        {title && <h2 className="sheet-title">{title}</h2>}
        {children}
      </div>
    </dialog>
  );
}

/* ---------- Confirm ---------- */
export function ConfirmSheet({ open, onClose, title, desc, okLabel = '확인', danger, onOk }: {
  open: boolean; onClose: () => void; title: string; desc?: string;
  okLabel?: string; danger?: boolean; onOk: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      {desc && <p className="sheet-desc">{desc}</p>}
      <div className="sheet-actions">
        <Button onClick={onClose}>취소</Button>
        <Button
          variant={danger ? 'danger' : 'primary'}
          loading={busy}
          onClick={async () => {
            setBusy(true);
            try { await onOk(); onClose(); } finally { setBusy(false); }
          }}
        >
          {okLabel}
        </Button>
      </div>
    </Sheet>
  );
}

/* ---------- 기타 ---------- */
export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="empty-state">{children}</div>;
}
export function Dot({ color }: { color: string }) {
  return <span className="team-dot" style={{ background: color }} aria-hidden />;
}
export function Badge({ children, tone = 'default' }: { children: ReactNode; tone?: 'default' | 'live' | 'success' | 'warning' }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}
export function SectionHead({ title, sub, right }: { title: ReactNode; sub?: ReactNode; right?: ReactNode }) {
  return (
    <div className="section-head">
      <h2>{title}</h2>
      {sub && <span className="section-sub">{sub}</span>}
      {right && <span className="section-right">{right}</span>}
    </div>
  );
}
