import { Router, type RequestHandler } from 'express';
import type { SQLInputValue } from 'node:sqlite';
import { requireAuth, type User } from '../auth';
import { MAX_IMAGES, PAGE_SIZE, type Category } from '../config';
import { many, now, one, run, transaction } from '../db';
import { ApiError, notFound } from '../errors';
import { prepareImages, removeImages, upload, writeImages } from '../images';
import { MESSAGES, parseId, parseIdList, parseListQuery, parsePage, parsePostInput } from '../validation';
import { commentsForPost } from './comments';

export const postsRouter = Router();

type SummaryRow = {
  id: number;
  category: Category;
  title: string;
  created_at: string;
  author_id: number;
  author_nickname: string;
  comment_count: number;
  like_count: number;
  has_image: number;
};

const SUMMARY_COLUMNS = `
  p.id, p.category, p.title, p.created_at,
  u.id AS author_id, u.nickname AS author_nickname,
  (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) AS comment_count,
  (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id) AS like_count,
  EXISTS (SELECT 1 FROM post_images i WHERE i.post_id = p.id) AS has_image`;

const toSummary = (row: SummaryRow) => ({
  id: row.id,
  category: row.category,
  title: row.title,
  author: { id: row.author_id, nickname: row.author_nickname },
  createdAt: row.created_at,
  commentCount: row.comment_count,
  likeCount: row.like_count,
  hasImage: Boolean(row.has_image),
});

const pageOf = <T>(items: T[], page: number, totalCount: number) => ({
  items,
  page,
  totalPages: Math.ceil(totalCount / PAGE_SIZE),
  totalCount,
});

const escapeLike = (text: string) => text.replace(/[\\%_]/g, (char) => `\\${char}`);

function getPostDetail(postId: number, viewer: User | undefined) {
  const row = one<SummaryRow & { body: string; updated_at: string }>(
    `SELECT ${SUMMARY_COLUMNS}, p.body, p.updated_at
     FROM posts p JOIN users u ON u.id = p.user_id
     WHERE p.id = ?`,
    postId,
  );
  if (!row) throw notFound();

  const { hasImage: _hasImage, ...summary } = toSummary(row);
  const viewerId = viewer?.id ?? 0;
  return {
    ...summary,
    body: row.body,
    updatedAt: row.updated_at,
    images: many<{ id: number; filename: string }>(
      'SELECT id, filename FROM post_images WHERE post_id = ? ORDER BY position, id',
      postId,
    ).map((image) => ({ id: image.id, url: `/uploads/${image.filename}` })),
    comments: commentsForPost(postId, viewer),
    isMine: row.author_id === viewerId,
    liked: Boolean(one('SELECT 1 FROM likes WHERE user_id = ? AND post_id = ?', viewerId, postId)),
    bookmarked: Boolean(one('SELECT 1 FROM bookmarks WHERE user_id = ? AND post_id = ?', viewerId, postId)),
  };
}

function requirePostId(value: unknown): number {
  const id = parseId(value);
  if (id === null || !one('SELECT 1 FROM posts WHERE id = ?', id)) throw notFound();
  return id;
}

/** 파일을 받기 전에 권한부터 확인해서, 권한 없는 요청이 업로드를 처리하게 만들지 않는다. */
const requirePostOwner: RequestHandler = (req, _res, next) => {
  const id = requirePostId(req.params.id);
  const post = one<{ user_id: number }>('SELECT user_id FROM posts WHERE id = ?', id);
  if (post?.user_id !== req.user?.id) throw new ApiError(403, 'FORBIDDEN', MESSAGES.forbidden);
  next();
};

const uploadedFiles = (files: unknown) => (files ?? []) as Express.Multer.File[];

postsRouter.get('/posts', (req, res) => {
  const { page, category, search } = parseListQuery(req.query);

  const conditions: string[] = [];
  const params: SQLInputValue[] = [];
  if (category) {
    conditions.push('p.category = ?');
    params.push(category);
  }
  if (search) {
    const pattern = `%${escapeLike(search)}%`;
    conditions.push(`(p.title LIKE ? ESCAPE '\\' OR p.body LIKE ? ESCAPE '\\')`);
    params.push(pattern, pattern);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const total = one<{ count: number }>(`SELECT COUNT(*) AS count FROM posts p ${where}`, ...params);
  const rows = many<SummaryRow>(
    `SELECT ${SUMMARY_COLUMNS}
     FROM posts p JOIN users u ON u.id = p.user_id
     ${where}
     ORDER BY p.id DESC
     LIMIT ? OFFSET ?`,
    ...params,
    PAGE_SIZE,
    (page - 1) * PAGE_SIZE,
  );

  res.json(pageOf(rows.map(toSummary), page, total?.count ?? 0));
});

postsRouter.post('/posts', requireAuth, upload, async (req, res) => {
  const input = parsePostInput(req.body);
  const images = prepareImages(uploadedFiles(req.files));
  await writeImages(images);

  let postId: number;
  try {
    postId = transaction(() => {
      const timestamp = now();
      const id = Number(
        run(
          'INSERT INTO posts (user_id, category, title, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
          req.user!.id,
          input.category,
          input.title,
          input.body,
          timestamp,
          timestamp,
        ).lastInsertRowid,
      );
      images.forEach((image, index) => {
        run('INSERT INTO post_images (post_id, filename, position) VALUES (?, ?, ?)', id, image.filename, index);
      });
      return id;
    });
  } catch (error) {
    await removeImages(images.map((image) => image.filename));
    throw error;
  }

  res.status(201).json({ post: getPostDetail(postId, req.user) });
});

postsRouter.get('/posts/:id', (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) throw notFound();
  res.json({ post: getPostDetail(id, req.user) });
});

postsRouter.patch('/posts/:id', requireAuth, requirePostOwner, upload, async (req, res) => {
  const postId = Number(req.params.id);
  const input = parsePostInput(req.body);
  const removeIds = parseIdList(req.body?.removeImageIds ?? req.body?.['removeImageIds[]']);
  const images = prepareImages(uploadedFiles(req.files));
  await writeImages(images);

  let removedFilenames: string[];
  try {
    // 파일을 쓰는 동안 같은 글에 다른 요청이 끝났을 수 있으므로, 장수와 존재 여부는 트랜잭션 안에서 확인한다.
    removedFilenames = transaction(() => {
      if (!one('SELECT 1 FROM posts WHERE id = ?', postId)) throw notFound();

      const existing = many<{ id: number; filename: string; position: number }>(
        'SELECT id, filename, position FROM post_images WHERE post_id = ?',
        postId,
      );
      const removing = existing.filter((image) => removeIds.includes(image.id));
      if (removing.length !== removeIds.length) {
        throw new ApiError(400, 'VALIDATION_ERROR', MESSAGES.badRequest);
      }
      if (existing.length - removing.length + images.length > MAX_IMAGES) {
        throw new ApiError(400, 'VALIDATION_ERROR', MESSAGES.imageCount, { images: MESSAGES.imageCount });
      }

      run(
        'UPDATE posts SET category = ?, title = ?, body = ?, updated_at = ? WHERE id = ?',
        input.category,
        input.title,
        input.body,
        now(),
        postId,
      );
      for (const image of removing) run('DELETE FROM post_images WHERE id = ?', image.id);
      const nextPosition = Math.max(-1, ...existing.map((image) => image.position)) + 1;
      images.forEach((image, index) => {
        run(
          'INSERT INTO post_images (post_id, filename, position) VALUES (?, ?, ?)',
          postId,
          image.filename,
          nextPosition + index,
        );
      });
      return removing.map((image) => image.filename);
    });
  } catch (error) {
    await removeImages(images.map((image) => image.filename));
    throw error;
  }

  await removeImages(removedFilenames);
  res.json({ post: getPostDetail(postId, req.user) });
});

postsRouter.delete('/posts/:id', requireAuth, requirePostOwner, async (req, res) => {
  const postId = Number(req.params.id);
  const images = many<{ filename: string }>('SELECT filename FROM post_images WHERE post_id = ?', postId);
  run('DELETE FROM posts WHERE id = ?', postId);
  await removeImages(images.map((image) => image.filename));
  res.status(204).end();
});

const likeCount = (postId: number) =>
  one<{ count: number }>('SELECT COUNT(*) AS count FROM likes WHERE post_id = ?', postId)?.count ?? 0;

postsRouter.put('/posts/:id/like', requireAuth, (req, res) => {
  const postId = requirePostId(req.params.id);
  run('INSERT OR IGNORE INTO likes (user_id, post_id, created_at) VALUES (?, ?, ?)', req.user!.id, postId, now());
  res.json({ liked: true, likeCount: likeCount(postId) });
});

postsRouter.delete('/posts/:id/like', requireAuth, (req, res) => {
  const postId = requirePostId(req.params.id);
  run('DELETE FROM likes WHERE user_id = ? AND post_id = ?', req.user!.id, postId);
  res.json({ liked: false, likeCount: likeCount(postId) });
});

postsRouter.put('/posts/:id/bookmark', requireAuth, (req, res) => {
  const postId = requirePostId(req.params.id);
  run('INSERT OR IGNORE INTO bookmarks (user_id, post_id, created_at) VALUES (?, ?, ?)', req.user!.id, postId, now());
  res.json({ bookmarked: true });
});

postsRouter.delete('/posts/:id/bookmark', requireAuth, (req, res) => {
  const postId = requirePostId(req.params.id);
  run('DELETE FROM bookmarks WHERE user_id = ? AND post_id = ?', req.user!.id, postId);
  res.json({ bookmarked: false });
});

postsRouter.get('/me/bookmarks', requireAuth, (req, res) => {
  const page = parsePage(req.query.page);
  const userId = req.user!.id;
  const total = one<{ count: number }>('SELECT COUNT(*) AS count FROM bookmarks WHERE user_id = ?', userId);
  const rows = many<SummaryRow>(
    `SELECT ${SUMMARY_COLUMNS}
     FROM bookmarks b
     JOIN posts p ON p.id = b.post_id
     JOIN users u ON u.id = p.user_id
     WHERE b.user_id = ?
     ORDER BY b.created_at DESC, b.rowid DESC
     LIMIT ? OFFSET ?`,
    userId,
    PAGE_SIZE,
    (page - 1) * PAGE_SIZE,
  );
  res.json(pageOf(rows.map(toSummary), page, total?.count ?? 0));
});
