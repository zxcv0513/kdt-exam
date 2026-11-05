import { useEffect, useRef, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { categoryLabel, errorMessage, type PostSummary } from './api';

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' });

export const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

export function Loading() {
  return (
    <p className="state" role="status">
      불러오는 중이에요
    </p>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <div className="state" role="alert">
      <p>{errorMessage(error)}</p>
      <button type="button" className="button" onClick={onRetry}>
        다시 시도
      </button>
    </div>
  );
}

export function NotFound() {
  return (
    <div className="state">
      <p>찾으시는 글이나 페이지가 없어요. 삭제되었거나 주소가 잘못되었을 수 있어요.</p>
      <Link to="/" className="button">
        글 목록으로
      </Link>
    </div>
  );
}

export function PostRow({ post, action }: { post: PostSummary; action?: ReactNode }) {
  return (
    <li className="post-row">
      <div className="post-row-main">
        <Link to={`/posts/${post.id}`} className="post-row-title">
          <span className="badge">{categoryLabel(post.category)}</span>
          <span className="post-row-text">{post.title}</span>
          {post.hasImage && <span className="meta-tag">사진</span>}
          <span className="comment-count" aria-label={`댓글 ${post.commentCount}개`}>
            [{post.commentCount}]
          </span>
        </Link>
        <p className="meta">
          <span className="meta-author">{post.author.nickname}</span>
          <span>{formatDate(post.createdAt)}</span>
          <span>좋아요 {post.likeCount}</span>
        </p>
      </div>
      {action}
    </li>
  );
}

const PAGE_WINDOW = 5;

export function Pagination({ page, totalPages }: { page: number; totalPages: number }) {
  const [params] = useSearchParams();
  if (totalPages <= 1) return null;

  const hrefFor = (target: number) => {
    const next = new URLSearchParams(params);
    next.set('page', String(target));
    return `?${next}`;
  };
  const first = Math.max(1, Math.min(page - 2, totalPages - PAGE_WINDOW + 1));
  const last = Math.min(totalPages, first + PAGE_WINDOW - 1);
  const pages = Array.from({ length: last - first + 1 }, (_, index) => first + index);

  return (
    <nav className="pagination" aria-label="페이지">
      {page > 1 && (
        <Link to={hrefFor(page - 1)} aria-label="이전 페이지">
          이전
        </Link>
      )}
      {pages.map((target) => (
        <Link key={target} to={hrefFor(target)} aria-current={target === page ? 'page' : undefined}>
          {target}
        </Link>
      ))}
      {page < totalPages && (
        <Link to={hrefFor(page + 1)} aria-label="다음 페이지">
          다음
        </Link>
      )}
    </nav>
  );
}

type ConfirmProps = {
  open: boolean;
  message: string;
  cancelLabel: string;
  confirmLabel: string;
  danger?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

/** 네이티브 dialog가 포커스 가두기, Esc 닫기, 닫은 뒤 포커스 복원을 처리한다. */
export function ConfirmDialog({ open, message, cancelLabel, confirmLabel, danger, onCancel, onConfirm }: ConfirmProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-label={message}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      <p>{message}</p>
      <div className="dialog-actions">
        <button type="button" className="button" onClick={onCancel}>
          {cancelLabel}
        </button>
        <button
          type="button"
          className={danger ? 'button button-danger' : 'button button-primary'}
          onClick={onConfirm}
        >
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}

type FieldProps = {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
};

export function Field({ id, label, hint, error, children }: FieldProps) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
      {hint && !error && (
        <p className="hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
      {error && (
        <p className="field-error" id={`${id}-error`}>
          {error}
        </p>
      )}
    </div>
  );
}

/** Field의 안내·오류 문구를 입력칸에 연결하는 속성 */
export const fieldProps = (id: string, hint: string | undefined, error: string | undefined) => ({
  id,
  'aria-invalid': error ? true : undefined,
  'aria-describedby': error ? `${id}-error` : hint ? `${id}-hint` : undefined,
});
