import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react';

export function useTitle(title: string) {
  useEffect(() => {
    document.title = title ? `${title} - 커뮤니티` : '커뮤니티';
  }, [title]);
}

/** 조건이 바뀌면 이전 요청을 취소해서, 늦게 도착한 응답이 최신 화면을 덮어쓰지 않게 한다. */
export function useResource<T>(load: (signal: AbortSignal) => Promise<T>, deps: DependencyList) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    loadRef
      .current(controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setData(result);
        setLoading(false);
      })
      .catch((reason) => {
        if (controller.signal.aborted) return;
        setError(reason);
        setLoading(false);
      });
    return () => controller.abort();
    // 호출하는 쪽이 deps로 다시 불러올 조건을 정한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, version]);

  const reload = useCallback(() => setVersion((current) => current + 1), []);
  return { data, setData, error, loading, reload };
}
