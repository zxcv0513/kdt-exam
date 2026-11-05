import { existsSync } from 'node:fs';
import path from 'node:path';
import express from 'express';
import { attachUser, csrfGuard } from './auth';
import { DIST_DIR, PORT, UPLOAD_DIR } from './config';
import { errorHandler, notFound } from './errors';
import { authRouter } from './routes/auth';
import { commentsRouter } from './routes/comments';
import { postsRouter } from './routes/posts';

const app = express();
app.disable('x-powered-by');

app.use(
  '/uploads',
  express.static(UPLOAD_DIR, {
    index: false,
    dotfiles: 'ignore',
    fallthrough: true,
    setHeaders: (res) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    },
  }),
);
app.use('/uploads', (_req, _res, next) => next(notFound()));

app.use('/api', attachUser, csrfGuard, express.json({ limit: '100kb' }));
app.use('/api', authRouter, postsRouter, commentsRouter);
app.use('/api', (_req, _res, next) => next(notFound()));

// 빌드된 화면이 있으면 같은 서버에서 제공한다. 개발 중에는 Vite가 화면을 맡는다.
if (existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
  app.get('/{*path}', (_req, res) => res.sendFile(path.join(DIST_DIR, 'index.html')));
}

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`커뮤니티 서버 실행 중: http://localhost:${PORT}`);
});
