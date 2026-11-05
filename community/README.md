# 커뮤니티 사이트

회원제 범용 게시판입니다. 요구사항은 `PRD.md`, 화면은 `DESIGN.md`, 데이터와 API는 `API.md`를 참고하세요.

Node v26.13.0에서 확인했습니다. 내장 `node:sqlite`를 쓰며, 더 낮은 버전은 시험하지 않았습니다.

## 실행

```bash
npm install
npm run dev
```

브라우저에서 http://localhost:5180 을 엽니다. API 서버는 3001 포트를 씁니다.

5180 포트는 고정입니다. 서버가 이 주소의 요청만 허용하기 때문에, 포트가 사용 중이면 다른 포트로 옮기지 않고 실행을 멈춥니다.

## 빌드한 화면으로 실행

```bash
npm run build
npm start
```

브라우저에서 http://localhost:3001 을 엽니다.

## 명령어

| 명령어 | 내용 |
|---|---|
| `npm run dev` | 화면과 API 서버를 함께 실행 |
| `npm run build` | 타입 검사 후 화면 빌드 |
| `npm start` | API 서버 실행 (빌드된 화면이 있으면 함께 제공) |
| `npm run typecheck` | 타입 검사 |
| `npm run test:api` | 임시 서버로 API 시험 |
| `npm run test:ui` | 빌드 후 설치된 Chrome으로 화면 시험 |
| `npm test` | API와 화면 시험 모두 실행 |

## 환경변수

모두 선택 사항입니다.

| 이름 | 기본값 | 내용 |
|---|---|---|
| `PORT` | `3001` | API 서버 포트 |
| `DATA_DIR` | `./data` | DB 파일과 업로드 이미지 폴더 |
| `ALLOWED_ORIGINS` | 로컬 주소 | 쓰기 요청을 허용할 주소 (쉼표로 구분) |

`NODE_ENV=production`이면 세션 쿠키에 `Secure`가 붙어서 HTTPS가 필요합니다.
