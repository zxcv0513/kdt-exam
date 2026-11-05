import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');

export const PORT = Number(process.env.PORT ?? 3001);
export const DATA_DIR = path.resolve(process.env.DATA_DIR ?? path.join(projectRoot, 'data'));
export const DB_PATH = path.join(DATA_DIR, 'community.db');
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
export const DIST_DIR = path.join(projectRoot, 'dist');
export const IS_PRODUCTION = process.env.NODE_ENV === 'production';

export const ALLOWED_ORIGINS = new Set(
  (process.env.ALLOWED_ORIGINS ?? `http://localhost:5180,http://127.0.0.1:5180,http://localhost:${PORT},http://127.0.0.1:${PORT}`)
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
);

export const SESSION_COOKIE = 'sid';
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const LOGIN_MAX_FAILURES = 5;
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;

export const PAGE_SIZE = 20;
export const MAX_IMAGES = 5;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const CATEGORIES = ['free', 'question', 'info'] as const;
export type Category = (typeof CATEGORIES)[number];
