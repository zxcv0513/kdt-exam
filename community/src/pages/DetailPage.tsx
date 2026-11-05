import { useRef, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { api, ApiError, categoryLabel, errorMessage, type Comment, type PostDetail } from '../api';
import { ConfirmDialog, ErrorState, formatDateTime, Loading, NotFound } from '../components';
import { useAuth, useToast } from '../context';
import { useResource, useTitle } from '../hooks';

export function DetailPage() {
  const { id = '' } = useParams();
  const { data, setData, error, loading, reload } = useResource((signal) => api.getPost(id, signal), [id]);
  useTitle(data?.post.title ?? '글 보기');

  if (loading) return <Loading />;
  if (error instanceof ApiError && error.status === 404) return <NotFound />;
  if (error != null || !data) return <ErrorState error={error} onRetry={reload} />;

  const update = (change: (post: PostDetail) => PostDetail) =>
    setData((current) => (current ? { post: change(current.post) } : current));

  return <PostView post={data.post} update={update} />;
}

type Update = (change: (post: PostDetail) => PostDetail) => void;

function PostView({ post, update }: { post: PostDetail; update: Update }) {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const liking = useRef(false);
  const bookmarking = useRef(false);

  const goToLogin = () => navigate('/login', { state: { from: location.pathname } });

  const toggleLike = async () => {
    if (!user) return goToLogin();
    if (liking.current) return;
    liking.current = true;
    const { liked, likeCount } = post;
    update((current) => ({ ...current, liked: !liked, likeCount: likeCount + (liked ? -1 : 1) }));
    try {
      const result = await api.setLike(post.id, !liked);
      update((current) => ({ ...current, ...result }));
    } catch (error) {
      update((current) => ({ ...current, liked, likeCount }));
      toast(errorMessage(error));
    } finally {
      liking.current = false;
    }
  };

  const toggleBookmark = async () => {
    if (!user) return goToLogin();
    if (bookmarking.current) return;
    bookmarking.current = true;
    const { bookmarked } = post;
    update((current) => ({ ...current, bookmarked: !bookmarked }));
    try {
      await api.setBookmark(post.id, !bookmarked);
      toast(bookmarked ? '저장을 취소했어요.' : '저장한 글에 추가했어요.');
    } catch (error) {
      update((current) => ({ ...current, bookmarked }));
      toast(errorMessage(error));
    } finally {
      bookmarking.current = false;
    }
  };

  const deletePost = async () => {
    setConfirmingDelete(false);
    try {
      await api.deletePost(post.id);
      toast('글을 삭제했어요.');
      navigate('/', { replace: true });
    } catch (error) {
      toast(errorMessage(error));
    }
  };

  return (
    <article>
      <header className="post-header">
        <span className="badge">{categoryLabel(post.category)}</span>
        <h1>{post.title}</h1>
        <p className="meta">
          <span className="meta-author">{post.author.nickname}</span>
          <span>{formatDateTime(post.createdAt)}</span>
        </p>
      </header>

      <div className="post-body">{post.body}</div>

      {post.images.length > 0 && (
        <div className="post-images">
          {post.images.map((image, index) => (
            <img key={image.id} src={image.url} alt={`${post.title} 첨부 이미지 ${index + 1}`} loading="lazy" />
          ))}
        </div>
      )}

      <div className="post-actions">
        <button type="button" className="button" aria-pressed={post.liked} onClick={toggleLike}>
          좋아요 {post.likeCount}
        </button>
        <button type="button" className="button" aria-pressed={post.bookmarked} onClick={toggleBookmark}>
          {post.bookmarked ? '저장됨' : '저장'}
        </button>
        {post.isMine && (
          <span className="post-owner-actions">
            <Link to={`/posts/${post.id}/edit`} className="button">
              수정
            </Link>
            <button type="button" className="button" onClick={() => setConfirmingDelete(true)}>
              삭제
            </button>
          </span>
        )}
      </div>

      <Comments post={post} update={update} />

      <ConfirmDialog
        open={confirmingDelete}
        message="이 글을 삭제할까요? 삭제하면 되돌릴 수 없어요."
        cancelLabel="취소"
        confirmLabel="삭제"
        danger
        onCancel={() => setConfirmingDelete(false)}
        onConfirm={deletePost}
      />
    </article>
  );
}

function Comments({ post, update }: { post: PostDetail; update: Update }) {
  const { user, loading: authLoading } = useAuth();
  const toast = useToast();
  const location = useLocation();
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!body.trim()) {
      setError('댓글을 입력해 주세요.');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      const { comment } = await api.createComment(post.id, body);
      update((current) => ({
        ...current,
        comments: [...current.comments, comment],
        commentCount: current.commentCount + 1,
      }));
      setBody('');
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async () => {
    const id = deletingId;
    setDeletingId(null);
    if (id === null) return;
    try {
      await api.deleteComment(id);
      update((current) => ({
        ...current,
        comments: current.comments.filter((comment) => comment.id !== id),
        commentCount: current.commentCount - 1,
      }));
    } catch (reason) {
      toast(errorMessage(reason));
    }
  };

  const replace = (next: Comment) =>
    update((current) => ({
      ...current,
      comments: current.comments.map((comment) => (comment.id === next.id ? next : comment)),
    }));

  return (
    <section className="comments" aria-labelledby="comments-title">
      <h2 id="comments-title">댓글 {post.commentCount}</h2>

      {post.comments.length === 0 ? (
        <p className="muted">아직 댓글이 없어요.</p>
      ) : (
        <ul className="comment-list">
          {post.comments.map((comment) => (
            <CommentItem key={comment.id} comment={comment} onSaved={replace} onDelete={setDeletingId} />
          ))}
        </ul>
      )}

      {authLoading ? null : user ? (
        <form className="comment-form" onSubmit={submit} noValidate>
          <label htmlFor="comment-input" className="visually-hidden">
            댓글 입력
          </label>
          <textarea
            id="comment-input"
            rows={3}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="댓글을 입력해 주세요"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'comment-input-error' : undefined}
          />
          {error && (
            <p className="field-error" id="comment-input-error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="button button-primary" disabled={submitting}>
            {submitting ? '처리 중이에요' : '댓글 등록'}
          </button>
        </form>
      ) : (
        <p className="login-prompt">
          <Link to="/login" state={{ from: location.pathname }}>
            로그인
          </Link>
          하면 댓글을 남길 수 있어요.
        </p>
      )}

      <ConfirmDialog
        open={deletingId !== null}
        message="이 댓글을 삭제할까요?"
        cancelLabel="취소"
        confirmLabel="삭제"
        danger
        onCancel={() => setDeletingId(null)}
        onConfirm={remove}
      />
    </section>
  );
}

type CommentItemProps = {
  comment: Comment;
  onSaved: (comment: Comment) => void;
  onDelete: (id: number) => void;
};

function CommentItem({ comment, onSaved, onDelete }: CommentItemProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.body);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const inputId = `comment-edit-${comment.id}`;

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft.trim()) {
      setError('댓글을 입력해 주세요.');
      return;
    }
    setError('');
    setSaving(true);
    try {
      const result = await api.updateComment(comment.id, draft);
      onSaved(result.comment);
      setEditing(false);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setSaving(false);
    }
  };

  return (
    <li className="comment">
      <p className="meta">
        <span className="meta-author">{comment.author.nickname}</span>
        <span>{formatDateTime(comment.createdAt)}</span>
      </p>
      {editing ? (
        <form onSubmit={save} noValidate>
          <label htmlFor={inputId} className="visually-hidden">
            댓글 수정
          </label>
          <textarea
            id={inputId}
            rows={3}
            autoFocus
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${inputId}-error` : undefined}
          />
          {error && (
            <p className="field-error" id={`${inputId}-error`} role="alert">
              {error}
            </p>
          )}
          <div className="comment-actions">
            <button type="submit" className="button button-primary" disabled={saving}>
              {saving ? '처리 중이에요' : '수정 완료'}
            </button>
            <button
              type="button"
              className="button"
              onClick={() => {
                setEditing(false);
                setDraft(comment.body);
                setError('');
              }}
            >
              취소
            </button>
          </div>
        </form>
      ) : (
        <>
          <p className="comment-body">{comment.body}</p>
          {comment.isMine && (
            <div className="comment-actions">
              <button type="button" className="link-button" onClick={() => setEditing(true)}>
                수정
              </button>
              <button type="button" className="link-button" onClick={() => onDelete(comment.id)}>
                삭제
              </button>
            </div>
          )}
        </>
      )}
    </li>
  );
}
