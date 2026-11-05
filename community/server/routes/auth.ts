import { Router } from 'express';
import {
  assertLoginAllowed,
  clearLoginFailures,
  dummyPasswordHash,
  endSession,
  hashPassword,
  readSessionCookie,
  recordLoginFailure,
  startSession,
  verifyPassword,
  type User,
} from '../auth';
import { now, one, run } from '../db';
import { ApiError } from '../errors';
import { MESSAGES, parseLogin, parseSignup, USERNAME_PATTERN } from '../validation';

export const authRouter = Router();

const usernameTaken = () =>
  new ApiError(409, 'DUPLICATE_USERNAME', MESSAGES.usernameTaken, { username: MESSAGES.usernameTaken });
const nicknameTaken = () =>
  new ApiError(409, 'DUPLICATE_NICKNAME', MESSAGES.nicknameTaken, { nickname: MESSAGES.nicknameTaken });

authRouter.post('/auth/signup', async (req, res) => {
  const { username, nickname, password } = parseSignup(req.body);

  if (one('SELECT 1 FROM users WHERE username = ?', username)) throw usernameTaken();
  if (one('SELECT 1 FROM users WHERE nickname = ?', nickname)) throw nicknameTaken();

  const passwordHash = await hashPassword(password);

  let userId: number;
  try {
    const result = run(
      'INSERT INTO users (username, nickname, password_hash, created_at) VALUES (?, ?, ?, ?)',
      username,
      nickname,
      passwordHash,
      now(),
    );
    userId = Number(result.lastInsertRowid);
  } catch (error) {
    // 위 중복 확인과 INSERT 사이에 같은 값으로 가입한 경우
    const message = error instanceof Error ? error.message : '';
    if (message.includes('users.username')) throw usernameTaken();
    if (message.includes('users.nickname')) throw nicknameTaken();
    throw error;
  }

  startSession(res, userId);
  const user: User = { id: userId, username, nickname };
  res.status(201).json({ user });
});

authRouter.post('/auth/login', async (req, res) => {
  const { username, password } = parseLogin(req.body);
  const invalidCredentials = () => new ApiError(401, 'INVALID_CREDENTIALS', MESSAGES.loginFailed);

  // 가입할 수 없는 형식은 있을 수 없는 계정이므로, 긴 문자열을 실패 기록에 남기지 않고 바로 거절한다.
  if (!USERNAME_PATTERN.test(username)) throw invalidCredentials();

  assertLoginAllowed(username, req.ip);
  // 비밀번호 확인은 비동기라서, 끝난 뒤에 기록하면 동시 요청이 모두 제한을 통과한다. 먼저 기록하고 성공하면 지운다.
  recordLoginFailure(username, req.ip);

  const row = one<User & { password_hash: string }>(
    'SELECT id, username, nickname, password_hash FROM users WHERE username = ?',
    username,
  );
  const matched = await verifyPassword(password, row?.password_hash ?? dummyPasswordHash);

  if (!row || !matched) throw invalidCredentials();

  clearLoginFailures(username, req.ip);
  startSession(res, row.id);
  const user: User = { id: row.id, username: row.username, nickname: row.nickname };
  res.json({ user });
});

authRouter.post('/auth/logout', (req, res) => {
  endSession(readSessionCookie(req.headers.cookie), res);
  res.status(204).end();
});

authRouter.get('/auth/me', (req, res) => {
  res.json({ user: req.user ?? null });
});
