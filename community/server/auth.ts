import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { RequestHandler, Response } from 'express';
import {
  ALLOWED_ORIGINS,
  IS_PRODUCTION,
  LOGIN_MAX_FAILURES,
  LOGIN_WINDOW_MS,
  SESSION_COOKIE,
  SESSION_TTL_MS,
} from './config';
import { now, one, run } from './db';
import { ApiError } from './errors';
import { MESSAGES } from './validation';

export type User = { id: number; username: string; nickname: string };

declare global {
  namespace Express {
    interface Request {
      user?: User;
      hadSessionCookie?: boolean;
    }
  }
}

const scryptAsync = promisify(scrypt) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;
const KEY_LENGTH = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, KEY_LENGTH);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [, saltHex, keyHex] = stored.split('$');
  const expected = Buffer.from(keyHex, 'hex');
  const actual = await scryptAsync(password, Buffer.from(saltHex, 'hex'), KEY_LENGTH);
  return timingSafeEqual(actual, expected);
}

/** 없는 아이디도 같은 시간이 걸리게 해서, 응답 시간으로 가입 여부를 알 수 없게 한다. */
export const dummyPasswordHash = await hashPassword(randomBytes(16).toString('hex'));

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export function startSession(res: Response, userId: number) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  run('DELETE FROM sessions WHERE expires_at <= ?', now());
  run('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)', hashToken(token), userId, expiresAt);
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: IS_PRODUCTION,
    maxAge: SESSION_TTL_MS,
    path: '/',
  });
}

export function endSession(token: string | undefined, res: Response) {
  if (token) run('DELETE FROM sessions WHERE token_hash = ?', hashToken(token));
  res.clearCookie(SESSION_COOKIE, { path: '/' });
}

export function readSessionCookie(header: string | undefined): string | undefined {
  for (const part of header?.split(';') ?? []) {
    const separator = part.indexOf('=');
    if (separator !== -1 && part.slice(0, separator).trim() === SESSION_COOKIE) {
      return part.slice(separator + 1).trim();
    }
  }
  return undefined;
}

export const attachUser: RequestHandler = (req, _res, next) => {
  const token = readSessionCookie(req.headers.cookie);
  req.hadSessionCookie = Boolean(token);
  if (token) {
    req.user = one<User>(
      `SELECT u.id, u.username, u.nickname
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ?`,
      hashToken(token),
      now(),
    );
  }
  next();
};

export const requireAuth: RequestHandler = (req, _res, next) => {
  if (req.user) return next();
  throw new ApiError(
    401,
    'UNAUTHENTICATED',
    req.hadSessionCookie ? MESSAGES.sessionExpired : MESSAGES.needLogin,
  );
};

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export const csrfGuard: RequestHandler = (req, _res, next) => {
  if (SAFE_METHODS.has(req.method)) return next();
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) return next();
  throw new ApiError(403, 'CSRF_REJECTED', MESSAGES.csrf);
};

/** 서버 메모리에 기록하므로 재시작하면 초기화된다. 단일 서버 구성에서만 유효하다. */
const loginFailures = new Map<string, { count: number; resetAt: number }>();

const failureKey = (username: string, ip: string | undefined) => `${username}|${ip ?? ''}`;

export function assertLoginAllowed(username: string, ip: string | undefined) {
  const entry = loginFailures.get(failureKey(username, ip));
  if (entry && entry.resetAt > Date.now() && entry.count >= LOGIN_MAX_FAILURES) {
    throw new ApiError(429, 'TOO_MANY_ATTEMPTS', MESSAGES.loginLocked);
  }
}

export function recordLoginFailure(username: string, ip: string | undefined) {
  const current = Date.now();
  for (const [key, entry] of loginFailures) {
    if (entry.resetAt <= current) loginFailures.delete(key);
  }
  const key = failureKey(username, ip);
  const entry = loginFailures.get(key);
  if (entry) entry.count += 1;
  else loginFailures.set(key, { count: 1, resetAt: current + LOGIN_WINDOW_MS });
}

export function clearLoginFailures(username: string, ip: string | undefined) {
  loginFailures.delete(failureKey(username, ip));
}
