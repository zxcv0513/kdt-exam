import { spawn } from 'node:child_process';
// API 시험: 임시 데이터 폴더로 서버를 띄워 실제 HTTP 요청을 보낸다. 실행: npm run test:api
import { mkdtempSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const PORT = 3901, BASE = `http://localhost:${PORT}`, ORIGIN = BASE;
const DATA = mkdtempSync(path.join(os.tmpdir(), 'community-api-'));
let pass = 0; const fails = [];
const ok = (name, cond, extra) => { if (cond) pass++; else fails.push(`${name} ${extra !== undefined ? JSON.stringify(extra) : ''}`); };

let server, serverLog = '';
async function start() {
  server = spawn(path.join(ROOT, 'node_modules/.bin/tsx'), ['server/index.ts'], { cwd: ROOT, env: { ...process.env, PORT, DATA_DIR: DATA } });
  server.stdout.on('data', d => serverLog += d); server.stderr.on('data', d => serverLog += d);
  for (let i = 0; i < 100; i++) { try { await fetch(`${BASE}/api/auth/me`); return; } catch { await new Promise(r => setTimeout(r, 100)); } }
  throw new Error('server did not start: ' + serverLog);
}
const stop = () => new Promise(r => { server.once('exit', r); server.kill(); });

class C {
  cookie = '';
  async req(method, url, { json, form, headers = {}, origin = ORIGIN } = {}) {
    const h = { ...headers }; if (origin) h.Origin = origin; if (this.cookie) h.Cookie = this.cookie;
    let body; if (json !== undefined) { h['Content-Type'] = 'application/json'; body = typeof json === 'string' ? json : JSON.stringify(json); } if (form) body = form;
    const res = await fetch(BASE + url, { method, headers: h, body });
    const sc = res.headers.get('set-cookie'); if (sc) { this.setCookie = sc; this.cookie = sc.split(';')[0]; }
    const t = await res.text(); let data; try { data = JSON.parse(t); } catch { data = t; }
    return { status: res.status, data, headers: res.headers };
  }
  get(u, o) { return this.req('GET', '/api' + u, o); } post(u, o) { return this.req('POST', '/api' + u, o); }
  patch(u, o) { return this.req('PATCH', '/api' + u, o); } put(u, o) { return this.req('PUT', '/api' + u, o); } del(u, o) { return this.req('DELETE', '/api' + u, o); }
}
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const JPG = Buffer.concat([Buffer.from([0xff,0xd8,0xff,0xe0]), Buffer.alloc(20)]);
const GIF = Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(20)]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(20)]);
function form(fields, files = []) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) for (const x of [v].flat()) f.append(k, String(x));
  for (const [name, buf, field = 'images'] of files) f.append(field, new Blob([buf]), name);
  return f;
}
const P = (o = {}) => ({ category: 'free', title: '제목', body: '본문', ...o });
const uploads = () => readdirSync(path.join(DATA, 'uploads')).length;
const code = r => r.data?.error?.code;

await start();
const a = new C(), b = new C(), anon = new C();

// 회원
ok('me null', (await anon.get('/auth/me')).data.user === null);
let r = await a.post('/auth/signup', { json: { username: 'alice1', nickname: '앨리스', password: 'password1' } });
ok('signup 201', r.status === 201 && r.data.user.nickname === '앨리스', r);
ok('cookie flags', /HttpOnly/i.test(a.setCookie) && /SameSite=Lax/i.test(a.setCookie), a.setCookie);
ok('no hash leak', !JSON.stringify(r.data).includes('hash'));
ok('me user', (await a.get('/auth/me')).data.user.username === 'alice1');
r = await b.post('/auth/signup', { json: { username: 'bobby2', nickname: '밥', password: 'x'.repeat(8) } });
ok('nickname 1char rejected', r.status === 400 && r.data.error.fields.nickname, r);
await b.post('/auth/signup', { json: { username: 'bobby2', nickname: '밥이', password: 'x'.repeat(64) } });
ok('b signed up, pw64', !!(await b.get('/auth/me')).data.user);
ok('dup username', code(await new C().post('/auth/signup', { json: { username: 'alice1', nickname: '다른이름', password: 'password1' } })) === 'DUPLICATE_USERNAME');
ok('dup nickname', code(await new C().post('/auth/signup', { json: { username: 'alice2', nickname: '앨리스', password: 'password1' } })) === 'DUPLICATE_NICKNAME');
for (const [u, n, p, s] of [['abc','닉네임','password1',400],['abcd','닉네임a','password1',201],['a'.repeat(20),'닉네임b','password1',201],['a'.repeat(21),'닉네임c','password1',400],['ABCD','닉네임d','password1',400],['user01','가'.repeat(12),'password1',201],['user02','가'.repeat(13),'password1',400],['user03','닉네임e','1234567',400],['user04','닉네임f','x'.repeat(65),400],['user05','😀😀','password1',201]])
  ok(`signup bound ${u.slice(0,6)}/${n.length}/${p.length}`, (await new C().post('/auth/signup', { json: { username: u, nickname: n, password: p } })).status === s);
ok('signup wrong types', (await new C().post('/auth/signup', { json: { username: 1, nickname: {}, password: [] } })).status === 400);

// 로그인
const l = new C();
ok('login wrong pw', code(await l.post('/auth/login', { json: { username: 'alice1', password: 'nope-nope' } })) === 'INVALID_CREDENTIALS');
ok('login unknown same code', code(await l.post('/auth/login', { json: { username: 'nobody9', password: 'nope-nope' } })) === 'INVALID_CREDENTIALS');
ok('login empty', (await l.post('/auth/login', { json: {} })).status === 400);
r = await l.post('/auth/login', { json: { username: 'alice1', password: 'password1' } });
ok('login ok', r.status === 200 && r.data.user.id, r);
const lim = new C(); const seq = [];
for (let i = 0; i < 6; i++) seq.push((await lim.post('/auth/login', { json: { username: 'user01', password: 'wrong-pass' } })).status);
ok('rate limit 5 then 429', seq.join() === '401,401,401,401,401,429', seq);
ok('locked even with right pw', (await lim.post('/auth/login', { json: { username: 'user01', password: 'password1' } })).status === 429);
ok('logout 204', (await l.post('/auth/logout')).status === 204);
const stale = new C(); stale.cookie = a.cookie;
const l2 = new C(); await l2.post('/auth/login', { json: { username: 'alice1', password: 'password1' } }); const old = l2.cookie;
await l2.post('/auth/logout'); l2.cookie = old;
ok('session dead after logout', (await l2.get('/auth/me')).data.user === null);

// CSRF
ok('csrf no origin', code(await a.post('/auth/logout', { origin: null })) === 'CSRF_REJECTED');
ok('csrf evil origin', code(await a.put('/posts/1/like', { origin: 'https://evil.example' })) === 'CSRF_REJECTED');

// 글 작성
ok('post needs auth', (await anon.post('/posts', { form: form(P()) })).status === 401);
r = await a.post('/posts', { form: form(P({ title: '첫 글' }), [['a.png', PNG], ['b.JPG', JPG], ['c.gif', GIF], ['d.webp', WEBP]]) });
ok('post with 4 image types', r.status === 201 && r.data.post.images.length === 4, r);
const p1 = r.data.post;
ok('detail shape', p1.isMine && !p1.liked && !p1.bookmarked && p1.likeCount === 0 && Array.isArray(p1.comments));
r = await anon.req('GET', p1.images[0].url);
ok('image served', r.status === 200 && r.headers.get('content-type') === 'image/png', r.status);
ok('nosniff', r.headers.get('x-content-type-options') === 'nosniff');
ok('traversal blocked', (await anon.req('GET', '/uploads/..%2fcommunity.db')).status === 404);
ok('upload 404 json', code(await anon.req('GET', '/uploads/none.png')) === 'NOT_FOUND');
const before = uploads();
for (const [name, f, s] of [
  ['bad category', form(P({ category: 'etc' })), 400], ['no title', form(P({ title: '   ' })), 400], ['no body', form(P({ body: '' })), 400],
  ['title100', form(P({ title: '가'.repeat(100) })), 201], ['title101', form(P({ title: '가'.repeat(101) })), 400],
  ['body10000', form(P({ body: '가'.repeat(10000) })), 201], ['body10001', form(P({ body: '가'.repeat(10001) })), 400],
]) ok(`post ${name}`, (await a.post('/posts', { form: f })).status === s);
const fake = Buffer.from('<script>alert(1)</script>');
ok('fake png', code(await a.post('/posts', { form: form(P(), [['x.png', fake]]) })) === 'UNSUPPORTED_IMAGE');
ok('html ext w/ png bytes', code(await a.post('/posts', { form: form(P(), [['x.html', PNG]]) })) === 'UNSUPPORTED_IMAGE');
ok('svg rejected', code(await a.post('/posts', { form: form(P(), [['x.svg', Buffer.from('<svg/>')]]) })) === 'UNSUPPORTED_IMAGE');
ok('empty file', code(await a.post('/posts', { form: form(P(), [['x.png', Buffer.alloc(0)]]) })) === 'UNSUPPORTED_IMAGE');
ok('good+bad leaves nothing', code(await a.post('/posts', { form: form(P(), [['g.png', PNG], ['x.png', fake]]) })) === 'UNSUPPORTED_IMAGE');
ok('5MB+1', code(await a.post('/posts', { form: form(P(), [['x.png', Buffer.concat([PNG, Buffer.alloc(5*1024*1024 + 1 - PNG.length)])]]) })) === 'FILE_TOO_LARGE');
ok('6 files', (await a.post('/posts', { form: form(P(), Array(6).fill(['x.png', PNG])) })).status === 400);
ok('wrong file field', (await a.post('/posts', { form: form(P(), [['x.png', PNG, 'other']]) })).status === 400);
ok('no orphan files', uploads() === before, [before, uploads()]);
r = await a.post('/posts', { form: form(P(), [['x.png', Buffer.concat([PNG, Buffer.alloc(5*1024*1024 - PNG.length)])]]) });
ok('exactly 5MB', r.status === 201, r.status);
r = await a.post('/posts', { form: form(P(), Array(5).fill(['x.png', PNG])) });
ok('5 files', r.status === 201 && r.data.post.images.length === 5);
const p5 = r.data.post;

// 수정·삭제 권한, 이미지 수정
ok('b cannot patch', code(await b.patch(`/posts/${p1.id}`, { form: form(P({ title: '해킹' })) })) === 'FORBIDDEN');
ok('b cannot delete', code(await b.del(`/posts/${p1.id}`)) === 'FORBIDDEN');
ok('anon cannot patch', (await anon.patch(`/posts/${p1.id}`, { form: form(P()) })).status === 401);
ok('title intact', (await anon.get(`/posts/${p1.id}`)).data.post.title === '첫 글');
ok('patch over limit', (await a.patch(`/posts/${p5.id}`, { form: form(P(), [['x.png', PNG]]) })).status === 400);
ok('patch foreign image', (await a.patch(`/posts/${p5.id}`, { form: form(P({ removeImageIds: p1.images[0].id })) })).status === 400);
ok('patch bad image id', (await a.patch(`/posts/${p5.id}`, { form: form(P({ removeImageIds: 'abc' })) })).status === 400);
const rmFile = path.join(DATA, 'uploads', path.basename(p5.images[0].url));
r = await a.patch(`/posts/${p5.id}`, { form: form(P({ title: '수정됨', removeImageIds: [p5.images[0].id, p5.images[1].id] }), [['n.png', PNG]]) });
ok('patch swap images', r.status === 200 && r.data.post.images.length === 4 && r.data.post.title === '수정됨', r);
ok('removed file gone', !existsSync(rmFile));
ok('patch 404', (await a.patch('/posts/999999', { form: form(P()) })).status === 404);

// 조회
ok('detail 404', (await anon.get('/posts/999999')).status === 404);
ok('detail bad id', (await anon.get('/posts/abc')).status === 404);
ok('bad uri no 500', (await anon.get('/posts/%E0%A4%A')).status < 500);
for (let i = 0; i < 25; i++) await b.post('/posts', { form: form(P({ category: 'question', title: `질문 ${i}`, body: i === 3 ? '100% 할인 a_b' : '내용' })) });
r = await anon.get('/posts');
ok('page size 20', r.data.items.length === 20 && r.data.totalPages >= 2 && r.data.page === 1, r.data.totalPages);
ok('newest first', r.data.items[0].title === '질문 24');
const total = r.data.totalCount;
ok('page 2', (await anon.get('/posts?page=2')).data.items.length === 20 || total < 40);
ok('page beyond', (await anon.get('/posts?page=999')).data.items.length === 0);
for (const q of ['page=0', 'page=-1', 'page=abc', 'page=1&page=2', 'category=etc']) ok(`bad ${q}`, (await anon.get(`/posts?${q}`)).status === 400);
ok('q too long', (await anon.get(`/posts?q=${'a'.repeat(101)}`)).status === 400);
r = await anon.get('/posts?category=question');
ok('category filter', r.data.totalCount === 25 && r.data.items.every(i => i.category === 'question'));
ok('search title', (await anon.get(`/posts?q=${encodeURIComponent('첫 글')}`)).data.totalCount === 1);
ok('search body', (await anon.get(`/posts?q=${encodeURIComponent('할인')}`)).data.totalCount === 1);
ok('search % literal', (await anon.get(`/posts?q=${encodeURIComponent('100%')}`)).data.totalCount === 1);
ok('search bare %', (await anon.get(`/posts?q=${encodeURIComponent('%')}`)).data.totalCount === 1);
ok('search _ literal', (await anon.get(`/posts?q=${encodeURIComponent('a_b')}`)).data.totalCount === 1);
ok('search+category', (await anon.get(`/posts?q=${encodeURIComponent('첫 글')}&category=question`)).data.totalCount === 0);
r = await anon.get(`/posts?q=${encodeURIComponent("' OR 1=1 --")}`);
ok('sql injection harmless', r.status === 200 && r.data.totalCount === 0 && r.data.totalPages === 0, r);
ok('hasImage', (await anon.get(`/posts?q=${encodeURIComponent('첫 글')}`)).data.items[0].hasImage === true);

// 댓글
ok('comment auth', (await anon.post(`/posts/${p1.id}/comments`, { json: { body: 'x' } })).status === 401);
ok('comment 404', (await a.post('/posts/999999/comments', { json: { body: 'x' } })).status === 404);
ok('comment empty', (await a.post(`/posts/${p1.id}/comments`, { json: { body: '  ' } })).status === 400);
ok('comment 1000', (await a.post(`/posts/${p1.id}/comments`, { json: { body: '가'.repeat(1000) } })).status === 201);
ok('comment 1001', (await a.post(`/posts/${p1.id}/comments`, { json: { body: '가'.repeat(1001) } })).status === 400);
r = await b.post(`/posts/${p1.id}/comments`, { json: { body: '<img src=x onerror=alert(1)>' } });
const c1 = r.data.comment;
ok('comment stored raw', c1.body.startsWith('<img') && c1.isMine);
ok('a cannot edit b comment', code(await a.patch(`/comments/${c1.id}`, { json: { body: 'x' } })) === 'FORBIDDEN');
ok('a cannot del b comment', code(await a.del(`/comments/${c1.id}`)) === 'FORBIDDEN');
ok('edit own', (await b.patch(`/comments/${c1.id}`, { json: { body: '수정' } })).data.comment.body === '수정');
r = await a.get(`/posts/${p1.id}`);
ok('isMine per viewer', r.data.post.comments.filter(c => c.isMine).length === 1 && r.data.post.commentCount === 2);
ok('delete own comment', (await b.del(`/comments/${c1.id}`)).status === 204);
ok('comment 404 after', (await b.del(`/comments/${c1.id}`)).status === 404);

// 좋아요
ok('like auth', (await anon.put(`/posts/${p1.id}/like`)).status === 401);
const rs = await Promise.all(Array.from({ length: 10 }, () => a.put(`/posts/${p1.id}/like`)));
ok('10 parallel likes = 1', rs.every(x => x.status === 200 && x.data.likeCount === 1), rs.map(x => x.data));
ok('second user', (await b.put(`/posts/${p1.id}/like`)).data.likeCount === 2);
ok('liked flag', (await a.get(`/posts/${p1.id}`)).data.post.liked === true);
ok('unlike', (await a.del(`/posts/${p1.id}/like`)).data.likeCount === 1);
ok('unlike twice', (await a.del(`/posts/${p1.id}/like`)).data.likeCount === 1);
ok('like 404', (await a.put('/posts/999999/like')).status === 404);

// 저장
const list = await anon.get('/posts'); const [x, y] = list.data.items;
ok('bookmark auth', (await anon.put(`/posts/${x.id}/bookmark`)).status === 401);
ok('list auth', (await anon.get('/me/bookmarks')).status === 401);
await a.put(`/posts/${x.id}/bookmark`); await a.put(`/posts/${x.id}/bookmark`); await a.put(`/posts/${y.id}/bookmark`); await a.put(`/posts/${p1.id}/bookmark`);
r = await a.get('/me/bookmarks');
ok('bookmark list recent first', r.data.totalCount === 3 && r.data.items[0].id === p1.id && r.data.items[2].id === x.id, r.data.items.map(i => i.id));
ok('bookmark private list', (await b.get('/me/bookmarks')).data.totalCount === 0);
ok('bookmark private flag', (await b.get(`/posts/${p1.id}`)).data.post.bookmarked === false && (await a.get(`/posts/${p1.id}`)).data.post.bookmarked === true);
ok('unbookmark', (await a.del(`/posts/${y.id}/bookmark`)).data.bookmarked === false);
ok('bad bookmark page', (await a.get('/me/bookmarks?page=0')).status === 400);

// 재시작 유지
await stop(); await start();
ok('session survives restart', (await a.get('/auth/me')).data.user?.username === 'alice1');
r = await a.get(`/posts/${p1.id}`);
ok('post survives', r.data.post.title === '첫 글' && r.data.post.likeCount === 1 && r.data.post.comments.length === 1 && r.data.post.bookmarked);
ok('image survives', (await anon.req('GET', p1.images[0].url)).status === 200);
ok('bookmarks survive', (await a.get('/me/bookmarks')).data.totalCount === 2);

// 글 삭제 연쇄
const files = p1.images.map(i => path.join(DATA, 'uploads', path.basename(i.url)));
ok('delete post', (await a.del(`/posts/${p1.id}`)).status === 204);
ok('post gone', (await anon.get(`/posts/${p1.id}`)).status === 404);
ok('files gone', files.every(f => !existsSync(f)));
ok('bookmark gone with post', (await a.get('/me/bookmarks')).data.totalCount === 1);

// 리뷰에서 찾은 문제 회귀 시험
await new C().post('/auth/signup', { json: { username: 'victim1', nickname: '피해자', password: 'password1' } });
const atk = await Promise.all(Array.from({ length: 30 }, (_, i) => new C().post('/auth/login', { json: { username: 'victim1', password: 'wrong-pass' + i } })));
ok('parallel login limited', atk.filter(x => x.status === 401).length === 5 && atk.filter(x => x.status === 429).length === 25, atk.map(x => x.status));
ok('huge username rejected', (await new C().post('/auth/login', { json: { username: 'a'.repeat(90000), password: 'x' } })).status === 401);
const mp = (ct, body) => fetch(BASE + '/api/posts', { method: 'POST', headers: { Origin: ORIGIN, Cookie: a.cookie, 'Content-Type': ct }, body });
ok('no boundary 400', (await mp('multipart/form-data', 'junk')).status === 400);
ok('truncated 400', (await mp('multipart/form-data; boundary=x', '--x\r\nContent-Disposition: form-data; name="title"\r\n\r\nabc')).status === 400);
r = await a.post('/posts', { form: form(P()) }); const race = r.data.post.id;
const n0 = uploads();
const pr = await Promise.all(Array.from({ length: 4 }, () => a.patch(`/posts/${race}`, { form: form(P(), Array(3).fill(['x.png', PNG])) })));
const after = (await a.get(`/posts/${race}`)).data.post.images.length;
ok('parallel patch keeps limit', after <= 5 && pr.filter(x => x.status === 200).length === 1, [after, pr.map(x => x.status)]);
ok('parallel patch no orphans', uploads() === n0 + after, [n0, after, uploads()]);
const dr = await Promise.all([a.patch(`/posts/${race}`, { form: form(P(), [['x.png', PNG]]) }), a.del(`/posts/${race}`)]);
ok('patch vs delete no 500', dr.every(x => x.status < 500), dr.map(x => x.status));
ok('patch vs delete no orphans', uploads() === n0, [n0, uploads()]);
ok('crlf normalized', (await a.post('/posts', { form: form(P({ body: 'a\nb' })) })).data.post.body === 'a\nb');

// 기타
ok('bad json 400', (await a.post('/auth/login', { json: '{oops' })).status === 400);
r = await anon.get('/nothing'); ok('unknown api 404 json', code(r) === 'NOT_FOUND');
ok('body too large 400', (await a.post(`/posts/${x.id}/comments`, { json: { body: 'a'.repeat(200000) } })).status === 400);

// DB 직접 확인
const db = new DatabaseSync(path.join(DATA, 'community.db'));
const u = db.prepare("SELECT password_hash FROM users WHERE username='alice1'").get();
ok('password hashed', u.password_hash.startsWith('scrypt$') && !u.password_hash.includes('password1'));
const raw = a.cookie.split('=')[1];
ok('token hashed', !db.prepare('SELECT 1 FROM sessions WHERE token_hash=?').get(raw));
db.exec("UPDATE sessions SET expires_at='2000-01-01T00:00:00.000Z'"); db.close();
r = await a.post('/posts', { form: form(P()) });
ok('expired session 401 msg', r.status === 401 && r.data.error.message.includes('만료'), r);

await stop();
ok('no 500 logged', !/Error/.test(serverLog), serverLog.slice(0, 800));
rmSync(DATA, { recursive: true, force: true });
console.log(`PASS ${pass}  FAIL ${fails.length}`); fails.forEach(f => console.log(' -', f.slice(0, 400)));
process.exitCode = fails.length ? 1 : 0;
