import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
} from 'react';

/* ── Button ─────────────────────────────────────────────────────────── */

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost' | 'sm';
  children: ReactNode;
}

export function Button({
  variant = 'primary',
  className = '',
  children,
  ...props
}: ButtonProps): ReactElement {
  return (
    <button type="button" className={`btn btn--${variant} ${className}`.trim()} {...props}>
      {children}
    </button>
  );
}

/* ── Card ─────────────────────────────────────────────────────────── */

interface CardProps {
  title?: string;
  children: ReactNode;
  className?: string;
  actions?: ReactNode;
  id?: string;
}

export function Card({ title, children, className = '', actions, id }: CardProps): ReactElement {
  return (
    <section className={`card ${className}`.trim()} id={id}>
      {(title !== undefined || actions !== undefined) && (
        <header className="card__header">
          {title !== undefined && <h3 className="card__title">{title}</h3>}
          {actions}
        </header>
      )}
      <div className="card__body">{children}</div>
    </section>
  );
}

/* ── StatusBadge ────────────────────────────────────────────────────── */

export type StatusKind = 'active' | 'idle' | 'stalled' | 'shipped' | 'drift' | string;

interface StatusBadgeProps {
  status: StatusKind;
  label?: string;
}

export function StatusBadge({ status, label }: StatusBadgeProps): ReactElement {
  const text = label ?? status;
  return <span className={`status-badge status-badge--${status}`}>{text}</span>;
}

/* ── Pill ─────────────────────────────────────────────────────────── */

interface PillProps {
  children: ReactNode;
  variant?: 'default' | 'local' | 'claude' | 'sync';
  className?: string;
}

export function Pill({ children, variant = 'default', className = '' }: PillProps): ReactElement {
  return <span className={`pill pill--${variant} ${className}`.trim()}>{children}</span>;
}

/* ── Chip ─────────────────────────────────────────────────────────── */

interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  children: ReactNode;
}

export function Chip({ active = false, children, className = '', ...props }: ChipProps): ReactElement {
  return (
    <button
      type="button"
      className={`chip${active ? ' chip--active' : ''} ${className}`.trim()}
      aria-pressed={active}
      {...props}
    >
      {children}
    </button>
  );
}

/* ── Tag ──────────────────────────────────────────────────────────── */

interface TagProps {
  children: ReactNode;
  color?: 'default' | 'todo' | 'fixme' | 'hack';
}

export function Tag({ children, color = 'default' }: TagProps): ReactElement {
  return <span className={`tag tag--${color}`}>{children}</span>;
}

/* ── Avatar ───────────────────────────────────────────────────────── */

interface AvatarProps {
  initials: string;
  size?: 'sm' | 'md' | 'lg';
  title?: string;
}

export function Avatar({ initials, size = 'md', title }: AvatarProps): ReactElement {
  return (
    <span className={`avatar avatar--${size}`} title={title} aria-label={title ?? initials}>
      {initials}
    </span>
  );
}

/* ── Switch ───────────────────────────────────────────────────────── */

interface SwitchProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string;
}

export function Switch({ label, id, className = '', ...props }: SwitchProps): ReactElement {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <label className={`switch ${className}`.trim()} htmlFor={inputId}>
      <input type="checkbox" role="switch" id={inputId} className="switch__input" {...props} />
      <span className="switch__track" aria-hidden="true" />
      <span className="switch__label">{label}</span>
    </label>
  );
}

/* ── Modal ────────────────────────────────────────────────────────── */

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}

export function Modal({ open, title, onClose, children, footer }: ModalProps): ReactElement | null {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = dialogRef.current;
    if (el === null) return;
    if (open && !el.open) {
      el.showModal();
    } else if (!open && el.open) {
      el.close();
    }
  }, [open]);

  if (!open) return null;

  return (
    <dialog ref={dialogRef} className="modal" onClose={onClose} onClick={(e) => {
      if (e.target === dialogRef.current) onClose();
    }}>
      <div className="modal__panel">
        <header className="modal__header">
          <h2 className="modal__title">{title}</h2>
          <button type="button" className="modal__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <div className="modal__body">{children}</div>
        {footer !== undefined && <footer className="modal__footer">{footer}</footer>}
      </div>
    </dialog>
  );
}

/* ── Toast ────────────────────────────────────────────────────────── */

interface ToastProps {
  level: 'info' | 'warn' | 'error';
  message: string;
  detail?: string;
  onDismiss?: () => void;
}

export function Toast({ level, message, detail, onDismiss }: ToastProps): ReactElement {
  return (
    <div className={`toast toast--${level}`} role="status">
      <div className="toast__content">
        <p className="toast__message">{message}</p>
        {detail !== undefined && <p className="toast__detail">{detail}</p>}
      </div>
      {onDismiss !== undefined && (
        <button type="button" className="toast__dismiss" onClick={onDismiss} aria-label="Dismiss">
          ×
        </button>
      )}
    </div>
  );
}

/* ── Table ────────────────────────────────────────────────────────── */

interface TableColumn<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
}

interface TableProps<T> {
  columns: TableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  emptyMessage?: string;
}

export function Table<T>({ columns, rows, rowKey, emptyMessage }: TableProps<T>): ReactElement {
  if (rows.length === 0 && emptyMessage !== undefined) {
    return <p className="empty-state">{emptyMessage}</p>;
  }
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key} scope="col">{col.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)}>
              {columns.map((col) => (
                <td key={col.key}>{col.render(row)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── Breadcrumb ───────────────────────────────────────────────────── */

interface BreadcrumbItem {
  label: string;
  onClick?: () => void;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
}

export function Breadcrumb({ items }: BreadcrumbProps): ReactElement {
  return (
    <nav className="breadcrumb" aria-label="Breadcrumb">
      <ol className="breadcrumb__list">
        {items.map((item, i) => (
          <li key={`${item.label}-${i}`} className="breadcrumb__item">
            {item.onClick !== undefined && i < items.length - 1 ? (
              <button type="button" className="breadcrumb__link" onClick={item.onClick}>
                {item.label}
              </button>
            ) : (
              <span className="breadcrumb__current" aria-current={i === items.length - 1 ? 'page' : undefined}>
                {item.label}
              </span>
            )}
            {i < items.length - 1 && <span className="breadcrumb__sep" aria-hidden="true">/</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/* ── Nudge ────────────────────────────────────────────────────────── */

interface NudgeProps {
  label: string;
  action: string;
  onAction?: () => void;
  severity?: 'info' | 'warn' | 'danger';
}

export function Nudge({ label, action, onAction, severity = 'info' }: NudgeProps): ReactElement {
  return (
    <div className={`nudge nudge--${severity}`}>
      <span className="nudge__label">{label}</span>
      {onAction !== undefined && (
        <button type="button" className="nudge__action" onClick={onAction}>
          {action}
        </button>
      )}
    </div>
  );
}

/* ── Meter ────────────────────────────────────────────────────────── */

interface MeterProps {
  value: number;
  label?: string;
  variant?: 'default' | 'warn' | 'danger';
}

export function Meter({ value, label, variant = 'default' }: MeterProps): ReactElement {
  const pct = Math.min(100, Math.max(0, value));
  return (
    <div className="meter">
      {label !== undefined && <span className="meter__label">{label}</span>}
      <div className="meter__track">
        <div
          className={`meter__fill meter__fill--${variant}`}
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
    </div>
  );
}

/* ── Popover (explain mode) ───────────────────────────────────────── */

export interface ExplainInfo {
  title: string;
  text: string;
  how?: string;
}

interface PopoverProps {
  info: ExplainInfo;
  open: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
}

export function Popover({ info, open, onClose, anchorRef }: PopoverProps): ReactElement | null {
  const popRef = useRef<HTMLDivElement>(null);

  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, handleKey]);

  useEffect(() => {
    if (!open || popRef.current === null || anchorRef.current === null) return;
    const anchor = anchorRef.current.getBoundingClientRect();
    const pop = popRef.current;
    pop.style.top = `${anchor.bottom + 6}px`;
    pop.style.left = `${Math.max(8, anchor.left - 120)}px`;
  }, [open, anchorRef]);

  if (!open) return null;

  return (
    <>
      <div className="popover-backdrop" onClick={onClose} aria-hidden="true" />
      <div ref={popRef} className="popover" role="dialog" aria-labelledby="popover-title">
        <h4 id="popover-title" className="popover__title">{info.title}</h4>
        <p className="popover__text">{info.text}</p>
        {info.how !== undefined && <p className="popover__how"><strong>How:</strong> {info.how}</p>}
        <button type="button" className="popover__close" onClick={onClose}>Close</button>
      </div>
    </>
  );
}

/* ── States ───────────────────────────────────────────────────────── */

export function EmptyState({ message }: { message: string }): ReactElement {
  return <p className="empty-state">{message}</p>;
}

export function LoadingState({ message }: { message: string }): ReactElement {
  return <p className="loading-state" aria-busy="true">{message}</p>;
}

export function ErrorState({ message }: { message: string }): ReactElement {
  return <p className="error-state" role="alert">{message}</p>;
}
