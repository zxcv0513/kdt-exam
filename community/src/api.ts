export type User = { id: number; username: string; nickname: string };
export type Category = 'free' | 'question' | 'info';

export const CATEGORIES: { value: Category; label: string }[] = [
  { value: 'free', label: '자유' },
  { value: 'question', label: '질문' },
  { value: 'info', label: '정보' },
];

export const categoryLabel = (value: Category) =>
  CATEGORIES.find((category) => category.value === value)?.label ?? value;

type Author = { id: number; nickname: string };

export type PostSummary = {
  id: number;
  category: Category;
  title: string;
  author: Author;
  createdAt: string;
  commentCount: number;
  likeCount: number;
  hasImage: boolean;
};

export type Comment = {
  id: number;
  body: string;
  author: Author;
  createdAt: string;
  updatedAt: string;
  isMine: boolean;
};

export type PostImage = { id: number; url: string };

export type PostDetail = Omit<PostSummary, 'hasImage'> & {
  body: string;
  updatedAt: string;
  images: PostImage[];
  comments: Comment[];
  isMine: boolean;
  liked: boolean;
  bookmarked: boolean;
};

export type Page<T> = { items: T[]; page: number; totalPages: number; totalCount: number };

const SERVER_ERROR_MESSAGE = '문제가 생겨서 처리하지 못했어요. 잠시 후 다시 시도해 주세요.';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields: Record<string, string> = {},
  ) {
    super(message);
  }
}

export const errorMessage = (error: unknown) =>
  error instanceof ApiError ? error.message : SERVER_ERROR_MESSAGE;

let onUnauthenticated = () => {};

/** 세션이 끝났다는 응답을 받았을 때 화면의 로그인 상태를 맞추기 위해 등록한다. */
export function setUnauthenticatedHandler(handler: () => void) {
  onUnauthenticated = handler;
}

type RequestOptions = { method?: string; json?: unknown; form?: FormData; signal?: AbortSignal };

async function request<T>(path: string, { method = 'GET', json, form, signal }: RequestOptions = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      signal,
      headers: json === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: form ?? (json === undefined ? undefined : JSON.stringify(json)),
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ApiError(0, 'NETWORK_ERROR', SERVER_ERROR_MESSAGE);
  }

  if (response.status === 204) return undefined as T;

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = data?.error;
    if (detail?.code === 'UNAUTHENTICATED') onUnauthenticated();
    throw new ApiError(
      response.status,
      detail?.code ?? 'INTERNAL_ERROR',
      detail?.message ?? SERVER_ERROR_MESSAGE,
      detail?.fields,
    );
  }
  return data as T;
}

export const api = {
  me: (signal?: AbortSignal) => request<{ user: User | null }>('/auth/me', { signal }),
  signup: (json: { username: string; nickname: string; password: string }) =>
    request<{ user: User }>('/auth/signup', { method: 'POST', json }),
  login: (json: { username: string; password: string }) =>
    request<{ user: User }>('/auth/login', { method: 'POST', json }),
  logout: () => request<void>('/auth/logout', { method: 'POST' }),

  listPosts: (query: { page: number; category: Category | null; q: string }, signal: AbortSignal) => {
    const params = new URLSearchParams({ page: String(query.page) });
    if (query.category) params.set('category', query.category);
    if (query.q) params.set('q', query.q);
    return request<Page<PostSummary>>(`/posts?${params}`, { signal });
  },
  getPost: (id: string, signal?: AbortSignal) => request<{ post: PostDetail }>(`/posts/${id}`, { signal }),
  createPost: (form: FormData) => request<{ post: PostDetail }>('/posts', { method: 'POST', form }),
  updatePost: (id: number, form: FormData) =>
    request<{ post: PostDetail }>(`/posts/${id}`, { method: 'PATCH', form }),
  deletePost: (id: number) => request<void>(`/posts/${id}`, { method: 'DELETE' }),

  createComment: (postId: number, body: string) =>
    request<{ comment: Comment }>(`/posts/${postId}/comments`, { method: 'POST', json: { body } }),
  updateComment: (id: number, body: string) =>
    request<{ comment: Comment }>(`/comments/${id}`, { method: 'PATCH', json: { body } }),
  deleteComment: (id: number) => request<void>(`/comments/${id}`, { method: 'DELETE' }),

  setLike: (postId: number, liked: boolean) =>
    request<{ liked: boolean; likeCount: number }>(`/posts/${postId}/like`, { method: liked ? 'PUT' : 'DELETE' }),
  setBookmark: (postId: number, bookmarked: boolean) =>
    request<{ bookmarked: boolean }>(`/posts/${postId}/bookmark`, { method: bookmarked ? 'PUT' : 'DELETE' }),
  listBookmarks: (page: number, signal: AbortSignal) =>
    request<Page<PostSummary>>(`/me/bookmarks?page=${page}`, { signal }),
};
