# 커뮤니티 사이트 데이터·API 계약

- 버전: v1.0 (2026-11-05 사용자 승인)
- 기준 문서: `PRD.md` v1.0
- 화면 설계: `DESIGN.md`

## 1. 기술 구성

| 영역 | 선택 | 근거 |
|---|---|---|
| 화면 | React 19 + Vite 8 + TypeScript | PRD 4장. 저장소의 `my-profile/package.json`과 같은 React·Vite 버전대 |
| 서버 | Express 5 + TypeScript | npm 최신 5.3.0 확인 |
| DB | Node 내장 `node:sqlite` | 이 환경(Node v26.13.0)에서 생성·조회·외래키 연쇄 삭제 실행 확인. 별도 네이티브 패키지 불필요 |
| 비밀번호 | Node 내장 `crypto.scrypt` + 사용자별 salt | 이 환경에서 실행 확인 |
| 업로드 | multer 2 | npm 최신 2.5.0 확인 |

```text
community/
  package.json      화면과 서버를 함께 관리
  server/           API, DB, 업로드 처리
  src/              React 화면
  data/             SQLite 파일, 업로드 이미지 (git 제외)
```

## 2. 데이터 구조

| 테이블 | 열 | 제약 |
|---|---|---|
| `users` | `id`, `username`, `nickname`, `password_hash`, `created_at` | `username`, `nickname` 고유 |
| `sessions` | `token_hash`, `user_id`, `expires_at` | 토큰은 해시로만 저장, 사용자 삭제 시 함께 삭제 |
| `posts` | `id`, `user_id`, `category`, `title`, `body`, `created_at`, `updated_at` | `category`는 `free`, `question`, `info` 중 하나 |
| `post_images` | `id`, `post_id`, `filename`, `position` | 글 삭제 시 함께 삭제 |
| `comments` | `id`, `post_id`, `user_id`, `body`, `created_at`, `updated_at` | 글 삭제 시 함께 삭제 |
| `likes` | `user_id`, `post_id`, `created_at` | 기본키 `(user_id, post_id)`, 글 삭제 시 함께 삭제 |
| `bookmarks` | `user_id`, `post_id`, `created_at` | 기본키 `(user_id, post_id)`, 글 삭제 시 함께 삭제 |

- `likes`의 복합 기본키가 FR-11의 "글마다 한 번"을 DB 수준에서 보장한다.
- `bookmarks`의 연쇄 삭제가 FR-13의 "원글 삭제 시 목록에서 제거"를 보장한다.
- 시각은 UTC ISO 8601 문자열로 저장하고 반환한다.
- 글을 삭제하면 DB 행을 지운 뒤 이미지 파일도 디스크에서 지운다.

## 3. 공통 규칙

- 기본 경로는 `/api`다. 요청과 응답은 JSON이고, 이미지를 포함하는 글 작성·수정만 `multipart/form-data`를 쓴다.
- 로그인 세션: 무작위 토큰을 `HttpOnly`, `SameSite=Lax` 쿠키에 담고 유효기간은 7일이다. 운영 환경에서는 `Secure`를 켠다.
- CSRF 방어: `GET` 외의 요청은 `Origin` 헤더가 허용 목록과 일치해야 하며, 쿠키의 `SameSite=Lax`와 함께 적용한다.
- 로그인 제한: 같은 아이디와 IP 조합으로 15분 안에 5번 실패하면 429로 거부한다.
- 검색: 제목과 본문의 부분 일치이며, `%`와 `_`는 일반 문자로 처리한다. 검색어는 100자까지다.
- 로그인 실패 기록은 서버 메모리에 두므로 서버를 재시작하면 초기화된다.

### 오류 응답

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "제목을 입력해 주세요.",
    "fields": { "title": "제목을 입력해 주세요." }
  }
}
```

`fields`는 입력 오류일 때만 포함한다. `message`는 `DESIGN.md` 5장 문구를 쓴다.

| 상태 | 코드 | 상황 |
|---|---|---|
| 400 | `VALIDATION_ERROR` | 입력 제한 위반, 잘못된 파라미터, 이미지 장수 초과 |
| 401 | `UNAUTHENTICATED` | 로그인 필요, 세션 만료 |
| 401 | `INVALID_CREDENTIALS` | 아이디 또는 비밀번호 불일치 (둘을 구분하지 않음) |
| 403 | `FORBIDDEN` | 본인 글·댓글이 아님 |
| 403 | `CSRF_REJECTED` | 허용되지 않은 `Origin` |
| 404 | `NOT_FOUND` | 대상 없음 |
| 409 | `DUPLICATE_USERNAME`, `DUPLICATE_NICKNAME` | 중복 가입 |
| 413 | `FILE_TOO_LARGE` | 이미지 5MB 초과 |
| 415 | `UNSUPPORTED_IMAGE` | 허용되지 않은 형식, 형식을 위장한 파일 |
| 429 | `TOO_MANY_ATTEMPTS` | 로그인 시도 초과 |
| 500 | `INTERNAL_ERROR` | 서버 오류 (내부 정보는 응답에 넣지 않음) |

### 공통 응답 형식

```ts
type User = { id: number; username: string; nickname: string };
type Category = 'free' | 'question' | 'info';

type PostSummary = {
  id: number;
  category: Category;
  title: string;
  author: { id: number; nickname: string };
  createdAt: string;
  commentCount: number;
  likeCount: number;
  hasImage: boolean;
};

type Comment = {
  id: number;
  body: string;
  author: { id: number; nickname: string };
  createdAt: string;
  updatedAt: string;
  isMine: boolean;
};

type PostDetail = Omit<PostSummary, 'hasImage'> & {
  body: string;
  updatedAt: string;
  images: { id: number; url: string }[];
  comments: Comment[];
  isMine: boolean;
  liked: boolean;
  bookmarked: boolean;
};

type Page<T> = { items: T[]; page: number; totalPages: number; totalCount: number };
```

## 4. API 목록

인증 열의 `회원`은 로그인 필요, `작성자`는 로그인과 본인 확인이 필요하다는 뜻이다.

### 회원

| 메서드·경로 | 인증 | 요청 | 성공 응답 | 주요 오류 | 기능 |
|---|---|---|---|---|---|
| `POST /auth/signup` | 없음 | `{ username, nickname, password }` | 201 `{ user: User }` + 세션 쿠키 | 400, 409 | FR-1 |
| `POST /auth/login` | 없음 | `{ username, password }` | 200 `{ user: User }` + 세션 쿠키 | 400, 401, 429 | FR-2 |
| `POST /auth/logout` | 없음 | 없음 | 204, 세션 삭제 | 403 | FR-2 |
| `GET /auth/me` | 없음 | 없음 | 200 `{ user: User \| null }` | - | FR-2 |

### 게시글

| 메서드·경로 | 인증 | 요청 | 성공 응답 | 주요 오류 | 기능 |
|---|---|---|---|---|---|
| `GET /posts` | 없음 | 쿼리 `page`, `category`, `q` | 200 `Page<PostSummary>` | 400 | FR-4, FR-7, FR-8 |
| `POST /posts` | 회원 | 폼 `category`, `title`, `body`, `images[]` | 201 `{ post: PostDetail }` | 400, 401, 413, 415 | FR-3, FR-9 |
| `GET /posts/:id` | 없음 | 없음 | 200 `{ post: PostDetail }` | 404 | FR-5, FR-10 |
| `PATCH /posts/:id` | 작성자 | 폼 `category`, `title`, `body`, `removeImageIds[]`, `images[]` | 200 `{ post: PostDetail }` | 400, 401, 403, 404, 413, 415 | FR-6, FR-9 |
| `DELETE /posts/:id` | 작성자 | 없음 | 204 | 401, 403, 404 | FR-6 |

- `page`는 1부터 시작한다. 전체 페이지보다 큰 값이면 빈 `items`를 반환한다.
- `PATCH`에서는 남는 이미지와 새 이미지를 합쳐 5장 이하여야 한다.
- 이미지 파일은 `/api` 밖의 정적 경로 `GET /uploads/:filename`으로 제공하고, `X-Content-Type-Options: nosniff`와 스크립트 실행을 막는 CSP를 붙인다.
- 파일 입력의 필드 이름은 `images`이고, 여러 장이면 같은 이름을 반복한다. `removeImageIds`도 같다.

### 댓글

| 메서드·경로 | 인증 | 요청 | 성공 응답 | 주요 오류 | 기능 |
|---|---|---|---|---|---|
| `POST /posts/:id/comments` | 회원 | `{ body }` | 201 `{ comment: Comment }` | 400, 401, 404 | FR-10 |
| `PATCH /comments/:id` | 작성자 | `{ body }` | 200 `{ comment: Comment }` | 400, 401, 403, 404 | FR-10 |
| `DELETE /comments/:id` | 작성자 | 없음 | 204 | 401, 403, 404 | FR-10 |

### 좋아요, 저장

`PUT`과 `DELETE`는 여러 번 보내도 결과가 같다. 그래서 중복 요청이 와도 집계가 늘지 않는다.

| 메서드·경로 | 인증 | 요청 | 성공 응답 | 주요 오류 | 기능 |
|---|---|---|---|---|---|
| `PUT /posts/:id/like` | 회원 | 없음 | 200 `{ liked: true, likeCount }` | 401, 404 | FR-11 |
| `DELETE /posts/:id/like` | 회원 | 없음 | 200 `{ liked: false, likeCount }` | 401, 404 | FR-11 |
| `PUT /posts/:id/bookmark` | 회원 | 없음 | 200 `{ bookmarked: true }` | 401, 404 | FR-12 |
| `DELETE /posts/:id/bookmark` | 회원 | 없음 | 200 `{ bookmarked: false }` | 401, 404 | FR-12 |
| `GET /me/bookmarks` | 회원 | 쿼리 `page` | 200 `Page<PostSummary>` (최근 저장순) | 400, 401 | FR-13 |

## 5. PRD 대응표

| 기능 | 화면 | API |
|---|---|---|
| FR-1 회원가입 | S6 | `POST /auth/signup` |
| FR-2 로그인·로그아웃 | S5, 상단 메뉴 | `POST /auth/login`, `POST /auth/logout`, `GET /auth/me` |
| FR-3 글 작성 | S3 | `POST /posts` |
| FR-4 글 목록 | S1 | `GET /posts` |
| FR-5 글 상세 | S2 | `GET /posts/:id` |
| FR-6 글 수정·삭제 | S2, S4 | `PATCH /posts/:id`, `DELETE /posts/:id` |
| FR-7 카테고리 | S1, S3 | `GET /posts?category=`, `POST /posts` |
| FR-8 검색 | S1 | `GET /posts?q=` |
| FR-9 이미지 첨부 | S2, S3, S4 | `POST /posts`, `PATCH /posts/:id`, `GET /uploads/:filename` |
| FR-10 댓글 | S2 | `POST /posts/:id/comments`, `PATCH /comments/:id`, `DELETE /comments/:id` |
| FR-11 좋아요 | S2 | `PUT`·`DELETE /posts/:id/like` |
| FR-12 글 저장 | S2, S7 | `PUT`·`DELETE /posts/:id/bookmark` |
| FR-13 저장한 글 모아보기 | S7 | `GET /me/bookmarks` |
