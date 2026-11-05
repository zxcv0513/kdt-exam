import { CATEGORIES, type Category } from './config';
import { ApiError } from './errors';

export const MESSAGES = {
  username: '영문 소문자와 숫자 4~20자로 입력해 주세요.',
  nickname: '2~12자로 입력해 주세요.',
  password: '8~64자로 입력해 주세요.',
  usernameTaken: '이미 사용 중인 아이디예요.',
  nicknameTaken: '이미 사용 중인 닉네임이에요.',
  loginRequired: '아이디와 비밀번호를 입력해 주세요.',
  loginFailed: '아이디 또는 비밀번호가 맞지 않아요.',
  loginLocked: '로그인 시도가 너무 많아요. 15분 후에 다시 시도해 주세요.',
  needLogin: '로그인이 필요해요.',
  sessionExpired: '로그인이 만료되었어요. 다시 로그인해 주세요.',
  forbidden: '내가 쓴 글과 댓글만 수정하거나 삭제할 수 있어요.',
  csrf: '허용되지 않은 요청이에요.',
  category: '카테고리를 선택해 주세요.',
  titleRequired: '제목을 입력해 주세요.',
  titleLength: '제목은 100자까지 입력할 수 있어요.',
  bodyRequired: '내용을 입력해 주세요.',
  bodyLength: '내용은 10,000자까지 입력할 수 있어요.',
  commentRequired: '댓글을 입력해 주세요.',
  commentLength: '댓글은 1,000자까지 입력할 수 있어요.',
  imageType: 'JPG, PNG, WebP, GIF 파일만 올릴 수 있어요.',
  imageSize: '이미지는 한 장에 5MB까지 올릴 수 있어요.',
  imageCount: '이미지는 글 하나에 5장까지 올릴 수 있어요.',
  badRequest: '요청 내용이 올바르지 않아요.',
  notFound: '찾으시는 글이나 페이지가 없어요. 삭제되었거나 주소가 잘못되었을 수 있어요.',
  server: '문제가 생겨서 처리하지 못했어요. 잠시 후 다시 시도해 주세요.',
} as const;

export const USERNAME_PATTERN = /^[a-z0-9]{4,20}$/;
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;
const MAX_SEARCH_LENGTH = 100;

/** 이모지가 2자로 세어지지 않도록 코드 포인트 기준으로 센다. */
const charCount = (value: string) => [...value].length;

const fail = (fields: Record<string, string>) =>
  new ApiError(400, 'VALIDATION_ERROR', Object.values(fields)[0], fields);

const asText = (value: unknown) => (typeof value === 'string' ? value : '');

type Body = Record<string, unknown> | undefined;

export function parseSignup(body: Body) {
  const username = asText(body?.username);
  const nickname = asText(body?.nickname).trim();
  const password = asText(body?.password);
  const fields: Record<string, string> = {};

  if (!USERNAME_PATTERN.test(username)) fields.username = MESSAGES.username;
  if (charCount(nickname) < 2 || charCount(nickname) > 12 || CONTROL_CHARS.test(nickname)) {
    fields.nickname = MESSAGES.nickname;
  }
  if (charCount(password) < 8 || charCount(password) > 64) fields.password = MESSAGES.password;

  if (Object.keys(fields).length > 0) throw fail(fields);
  return { username, nickname, password };
}

export function parseLogin(body: Body) {
  const username = asText(body?.username);
  const password = asText(body?.password);
  if (!username || !password) throw new ApiError(400, 'VALIDATION_ERROR', MESSAGES.loginRequired);
  return { username, password };
}

export function parsePostInput(body: Body) {
  const category = asText(body?.category);
  const title = asText(body?.title).trim();
  // 브라우저는 multipart 전송 때 줄바꿈을 \r\n으로 바꾸므로, 글자 수가 화면과 같도록 되돌린다.
  const text = asText(body?.body).replace(/\r\n/g, '\n').trim();
  const fields: Record<string, string> = {};

  if (!isCategory(category)) fields.category = MESSAGES.category;
  if (!title || CONTROL_CHARS.test(title)) fields.title = MESSAGES.titleRequired;
  else if (charCount(title) > 100) fields.title = MESSAGES.titleLength;
  if (!text || text.includes('\0')) fields.body = MESSAGES.bodyRequired;
  else if (charCount(text) > 10_000) fields.body = MESSAGES.bodyLength;

  if (Object.keys(fields).length > 0) throw fail(fields);
  return { category: category as Category, title, body: text };
}

export function parseComment(body: Body) {
  const text = asText(body?.body).trim();
  if (!text || text.includes('\0')) throw fail({ body: MESSAGES.commentRequired });
  if (charCount(text) > 1_000) throw fail({ body: MESSAGES.commentLength });
  return text;
}

export function parseId(value: unknown): number | null {
  if (typeof value !== 'string' || !/^[1-9]\d{0,14}$/.test(value)) return null;
  return Number(value);
}

export function parseIdList(value: unknown): number[] {
  if (value === undefined) return [];
  const list = Array.isArray(value) ? value : [value];
  const ids = list.map(parseId);
  if (ids.some((id) => id === null)) throw new ApiError(400, 'VALIDATION_ERROR', MESSAGES.badRequest);
  return [...new Set(ids as number[])];
}

export function parsePage(value: unknown): number {
  if (value === undefined) return 1;
  if (typeof value !== 'string' || !/^[1-9]\d{0,8}$/.test(value)) {
    throw new ApiError(400, 'VALIDATION_ERROR', MESSAGES.badRequest);
  }
  return Number(value);
}

export function parseListQuery(query: Record<string, unknown>) {
  const page = parsePage(query.page);
  const { category, q } = query;

  if (category !== undefined && category !== '' && !isCategory(category)) {
    throw new ApiError(400, 'VALIDATION_ERROR', MESSAGES.badRequest);
  }
  if (q !== undefined && typeof q !== 'string') {
    throw new ApiError(400, 'VALIDATION_ERROR', MESSAGES.badRequest);
  }
  const search = q?.trim() ?? '';
  if (charCount(search) > MAX_SEARCH_LENGTH) {
    throw new ApiError(400, 'VALIDATION_ERROR', MESSAGES.badRequest);
  }
  return { page, category: category ? (category as Category) : null, search };
}

function isCategory(value: unknown): value is Category {
  return CATEGORIES.includes(value as Category);
}
