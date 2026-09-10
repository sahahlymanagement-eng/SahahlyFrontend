// Ali Nassef: Cancel obsolete page requests and ignore their results and errors.
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import api from "../api/api";

export function usePagination(url, params = {}, limit = 10, dataKey = "data", enabled = true) {
  const [data, setData] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(enabled);
  const [total, setTotal] = useState(0);
  const [extra, setExtra] = useState({});
  const [error, setError] = useState(null);
  const activeRequest = useRef(null);
  const paramsJson = JSON.stringify(params);
  const stableParams = useMemo(() => JSON.parse(paramsJson), [paramsJson]);

  const fetchPage = useCallback(async (p) => {
    if (!enabled) return;
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    setLoading(true);
    setError(null);
    try {
      const res = await api.get(url, {
        params: { ...stableParams, page: p, limit },
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      const { [dataKey]: items, total, totalPages, page: currentPage, ...rest } = res.data;
      setData(items || []);
      setTotal(total || 0);
      setTotalPages(totalPages || 1);
      setPage(currentPage || p);
      setExtra(rest);
    } catch (err) {
      if (controller.signal.aborted || err.code === "ERR_CANCELED") return;
      setData([]);
      setTotal(0);
      setTotalPages(1);
      setExtra({});
      setError(err.response?.data?.message || err.response?.data?.error || err.message);
    } finally {
      if (activeRequest.current === controller && !controller.signal.aborted) setLoading(false);
    }
  }, [url, limit, dataKey, stableParams, enabled]);

  useEffect(() => {
    if (enabled) fetchPage(1);
    else {
      setLoading(false);
      setError(null);
    }
    return () => activeRequest.current?.abort();
  }, [fetchPage, enabled]);

  return { data, page, totalPages, total, loading, fetchPage, extra, setData, error };
}
