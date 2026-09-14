import { useState, useEffect, useCallback, useRef } from "react";
import api from "../api/api";

// How long a prefetched/visited page's raw response stays reusable without
// hitting the network again. Kept short and on the same order as the
// backend's own Classroom-listing cache (see staleWhileRevalidateCache.js on
// the server) so this never becomes staler than what the server already
// allows — it only removes the extra round trip for a page the user is
// about to see or just came from.
const PAGE_CACHE_TTL_MS = 10_000;

export function usePagination(url, params = {}, limit = 10, dataKey = "data", enabled = true) {
  const [data, setData] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [extra, setExtra] = useState({});
  const [error, setError] = useState(null);

  // Per-mount cache of raw page responses, keyed by page number under the
  // current url/params — reset implicitly whenever url/params/limit change
  // because requestPage's identity (and therefore every closure below) does.
  const cacheRef = useRef(new Map());

  const requestPage = useCallback(
    (p) => api.get(url, { params: { ...params, page: p, limit } }).then((res) => res.data),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [url, limit, JSON.stringify(params)]
  );

  useEffect(() => {
    cacheRef.current.clear();
  }, [requestPage]);

  const cacheKey = useCallback((p) => `${url}::${JSON.stringify(params)}::${p}`, [
    url,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    JSON.stringify(params),
  ]);

  // Fire-and-forget: warm the cache for a page (typically "the next one")
  // without touching any component state. Whenever fetchPage/pagination UI
  // later asks for that same page, it's served instantly instead of waiting
  // on Google Classroom / Drive again.
  const prefetchPage = useCallback(
    (p, knownTotalPages) => {
      if (p < 1 || (knownTotalPages && p > knownTotalPages)) return;
      const key = cacheKey(p);
      const cached = cacheRef.current.get(key);
      if (cached && Date.now() - cached.ts < PAGE_CACHE_TTL_MS) return;
      requestPage(p)
        .then((responseData) => {
          cacheRef.current.set(key, { data: responseData, ts: Date.now() });
        })
        .catch(() => {
          // Best-effort only — a real fetchPage(p) later just fetches live.
        });
    },
    [cacheKey, requestPage]
  );

  const fetchPage = useCallback(
    async (p) => {
      setLoading(true);
      setError(null);
      try {
        const key = cacheKey(p);
        const cached = cacheRef.current.get(key);
        const responseData =
          cached && Date.now() - cached.ts < PAGE_CACHE_TTL_MS
            ? cached.data
            : await requestPage(p).then((d) => {
                cacheRef.current.set(key, { data: d, ts: Date.now() });
                return d;
              });

        const { [dataKey]: items, total, totalPages, page: currentPage, ...rest } = responseData;

        setData(items || []);
        setTotal(total || 0);
        setTotalPages(totalPages || 1);
        setPage(currentPage || p);
        setExtra(rest);

        // Now that we know how many pages exist, warm the next one in the
        // background — the common "click Next" case becomes instant.
        prefetchPage((currentPage || p) + 1, totalPages || 1);
      } catch (err) {
        console.error(err);
        setData([]);
        setTotal(0);
        setTotalPages(1);
        setError(err.response?.data?.message || err.response?.data?.error || err.message);
      } finally {
        setLoading(false);
      }
    },
    [cacheKey, requestPage, dataKey, prefetchPage]
  );

      useEffect(() => {
    if (!enabled) return; // don't fetch if not ready
    fetchPage(1);
  }, [fetchPage, enabled]);
  
  // useEffect(() => {
  //   fetchPage(1);
  // }, [fetchPage]);

  return { data, page, totalPages, total, loading, fetchPage, extra, setData, error };
}