import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { api, errorMessage } from '../api';
import { ErrorState, Loading, Pagination, PostRow } from '../components';
import { useToast } from '../context';
import { useResource, useTitle } from '../hooks';
import { readPage } from './ListPage';

export function SavedPage() {
  useTitle('저장한 글');
  const toast = useToast();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const page = readPage(params.get('page'));
  const { data, error, loading, reload } = useResource((signal) => api.listBookmarks(page, signal), [page]);

  // 마지막 페이지의 글을 모두 저장 취소한 경우
  useEffect(() => {
    if (!loading && data && data.items.length === 0 && data.totalPages > 0) {
      navigate(`?page=${data.totalPages}`, { replace: true });
    }
  }, [loading, data, navigate]);

  const unsave = async (postId: number) => {
    try {
      await api.setBookmark(postId, false);
      toast('저장을 취소했어요.');
      reload();
    } catch (reason) {
      toast(errorMessage(reason));
    }
  };

  return (
    <>
      <h1 className="page-title">저장한 글</h1>
      {loading && <Loading />}
      {!loading && error != null && <ErrorState error={error} onRetry={reload} />}
      {!loading && !error && data && data.totalCount === 0 && (
        <p className="state">저장한 글이 없어요. 마음에 드는 글에서 저장 버튼을 눌러보세요.</p>
      )}
      {!loading && !error && data && data.items.length > 0 && (
        <>
          <ul className="post-list">
            {data.items.map((post) => (
              <PostRow
                key={post.id}
                post={post}
                action={
                  <button
                    type="button"
                    className="button"
                    aria-label={`${post.title} 저장 취소`}
                    onClick={() => unsave(post.id)}
                  >
                    저장 취소
                  </button>
                }
              />
            ))}
          </ul>
          <Pagination page={data.page} totalPages={data.totalPages} />
        </>
      )}
    </>
  );
}
