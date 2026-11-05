import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { api, CATEGORIES, type Category } from '../api';
import { ErrorState, Loading, Pagination, PostRow } from '../components';
import { useAuth } from '../context';
import { useResource, useTitle } from '../hooks';

const MAX_SEARCH_LENGTH = 100;

/** 사용자가 주소를 직접 고쳐도 오류 화면 대신 가장 가까운 정상 조건으로 보여준다. */
export const readPage = (value: string | null) => (value && /^[1-9]\d{0,8}$/.test(value) ? Number(value) : 1);

const readCategory = (value: string | null) =>
  CATEGORIES.some((category) => category.value === value) ? (value as Category) : null;

const listHref = (category: Category | null, q: string) => {
  const params = new URLSearchParams();
  if (category) params.set('category', category);
  if (q) params.set('q', q);
  const query = params.toString();
  return query ? `/?${query}` : '/';
};

export function ListPage() {
  useTitle('');
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const page = readPage(params.get('page'));
  const category = readCategory(params.get('category'));
  const q = (params.get('q') ?? '').trim().slice(0, MAX_SEARCH_LENGTH);

  const [searchText, setSearchText] = useState(q);
  useEffect(() => setSearchText(q), [q]);

  const { data, error, loading, reload } = useResource(
    (signal) => api.listPosts({ page, category, q }, signal),
    [page, category, q],
  );

  // 마지막 페이지의 글이 지워진 뒤 그 주소로 돌아온 경우
  useEffect(() => {
    if (!loading && data && data.items.length === 0 && data.totalPages > 0) {
      const next = new URLSearchParams(params);
      next.set('page', String(data.totalPages));
      navigate(`?${next}`, { replace: true });
    }
  }, [loading, data, params, navigate]);

  const search = (event: FormEvent) => {
    event.preventDefault();
    navigate(listHref(category, searchText.trim()));
  };

  return (
    <>
      <h1 className="visually-hidden">글 목록</h1>
      <form className="search" role="search" onSubmit={search}>
        <label htmlFor="search-input" className="visually-hidden">
          검색어
        </label>
        <input
          id="search-input"
          type="search"
          value={searchText}
          maxLength={MAX_SEARCH_LENGTH}
          onChange={(event) => setSearchText(event.target.value)}
          placeholder="제목이나 내용으로 검색"
        />
        <button type="submit" className="button">
          검색
        </button>
      </form>

      <nav className="tabs" aria-label="카테고리">
        <Link to={listHref(null, q)} aria-current={category === null ? 'page' : undefined}>
          전체
        </Link>
        {CATEGORIES.map((item) => (
          <Link
            key={item.value}
            to={listHref(item.value, q)}
            aria-current={category === item.value ? 'page' : undefined}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      {loading && <Loading />}
      {!loading && error != null && <ErrorState error={error} onRetry={reload} />}
      {!loading && !error && data && data.totalCount === 0 && (
        <div className="state">
          {q ? (
            <p>"{q}"에 맞는 글이 없어요. 다른 검색어로 찾아보세요.</p>
          ) : (
            <p>아직 글이 없어요. 첫 글을 남겨보세요.</p>
          )}
          {!q && user && (
            <Link to="/write" className="button button-primary">
              글쓰기
            </Link>
          )}
        </div>
      )}
      {!loading && !error && data && data.items.length > 0 && (
        <>
          <ul className="post-list">
            {data.items.map((post) => (
              <PostRow key={post.id} post={post} />
            ))}
          </ul>
          <Pagination page={data.page} totalPages={data.totalPages} />
        </>
      )}
    </>
  );
}
