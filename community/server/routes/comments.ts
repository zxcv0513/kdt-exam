import { Router } from 'express';
import { requireAuth, type User } from '../auth';
import { many, now, one, run } from '../db';
import { ApiError, notFound } from '../errors';
import { MESSAGES, parseComment, parseId } from '../validation';

export const commentsRouter = Router();

type CommentRow = {
  id: number;
  body: string;
  created_at: string;
  updated_at: string;
  author_id: number;
  author_nickname: string;
};

const COMMENT_SELECT = `
  SELECT c.id, c.body, c.created_at, c.updated_at, u.id AS author_id, u.nickname AS author_nickname
  FROM comments c JOIN users u ON u.id = c.user_id`;

const toComment = (row: CommentRow, viewer: User | undefined) => ({
  id: row.id,
  body: row.body,
  author: { id: row.author_id, nickname: row.author_nickname },
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  isMine: row.author_id === viewer?.id,
});

export function commentsForPost(postId: number, viewer: User | undefined) {
  return many<CommentRow>(`${COMMENT_SELECT} WHERE c.post_id = ? ORDER BY c.id`, postId).map((row) =>
    toComment(row, viewer),
  );
}

function getComment(commentId: number, viewer: User | undefined) {
  const row = one<CommentRow>(`${COMMENT_SELECT} WHERE c.id = ?`, commentId);
  if (!row) throw notFound();
  return toComment(row, viewer);
}

function requireCommentOwner(value: unknown, userId: number): number {
  const id = parseId(value);
  const comment = id === null ? undefined : one<{ user_id: number }>('SELECT user_id FROM comments WHERE id = ?', id);
  if (id === null || !comment) throw notFound();
  if (comment.user_id !== userId) throw new ApiError(403, 'FORBIDDEN', MESSAGES.forbidden);
  return id;
}

commentsRouter.post('/posts/:id/comments', requireAuth, (req, res) => {
  const postId = parseId(req.params.id);
  if (postId === null || !one('SELECT 1 FROM posts WHERE id = ?', postId)) throw notFound();

  const body = parseComment(req.body);
  const timestamp = now();
  const result = run(
    'INSERT INTO comments (post_id, user_id, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    postId,
    req.user!.id,
    body,
    timestamp,
    timestamp,
  );
  res.status(201).json({ comment: getComment(Number(result.lastInsertRowid), req.user) });
});

commentsRouter.patch('/comments/:id', requireAuth, (req, res) => {
  const id = requireCommentOwner(req.params.id, req.user!.id);
  const body = parseComment(req.body);
  run('UPDATE comments SET body = ?, updated_at = ? WHERE id = ?', body, now(), id);
  res.json({ comment: getComment(id, req.user) });
});

commentsRouter.delete('/comments/:id', requireAuth, (req, res) => {
  const id = requireCommentOwner(req.params.id, req.user!.id);
  run('DELETE FROM comments WHERE id = ?', id);
  res.status(204).end();
});
