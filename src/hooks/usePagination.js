import { useState, useEffect, useCallback } from "react";
import api from "../api/api";

export function usePagination(url, params = {}, limit = 10, dataKey = "data", enabled = true) {
  const [data, setData] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [extra, setExtra] = useState({});
  const [error, setError] = useState(null);

  const fetchPage = useCallback(async (p) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get(url, {
        params: { ...params, page: p, limit }
      });

      const { [dataKey]: items, total, totalPages, page: currentPage, ...rest } = res.data;

      setData(items || []);
      setTotal(total || 0);
      setTotalPages(totalPages || 1);
      setPage(currentPage || p);
      setExtra(rest);
    } catch (err) {
      console.error(err);
      setData([]);
      setTotal(0);
      setTotalPages(1);
      setError(err.response?.data?.message || err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }, [url, limit, JSON.stringify(params)]);

      useEffect(() => {
    if (!enabled) return; // don't fetch if not ready
    fetchPage(1);
  }, [fetchPage, enabled]);
  
  // useEffect(() => {
  //   fetchPage(1);
  // }, [fetchPage]);

  return { data, page, totalPages, total, loading, fetchPage, extra, setData, error };
}