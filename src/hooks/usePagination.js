import { useState, useEffect, useCallback } from "react";
import api from "../api/api";

export function usePagination(url, params = {}, limit = 10, dataKey = "data", enabled = true) {
  const [data, setData] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [extra, setExtra] = useState({}); // stores any extra fields like dueDateTime, maxGrade etc.


  const fetchPage = useCallback(async (p) => {
    setLoading(true);
    try {
      const res = await api.get(url, {
        params: { ...params, page: p, limit }
      });

      const { [dataKey]: items, total, totalPages, page: currentPage, ...rest } = res.data;

      setData(items || []);
      setTotal(total || 0);
      setTotalPages(totalPages || 1);
      setPage(currentPage || p);
      setExtra(rest); // dueDateTime, maxGrade, assignmentTitle, classroomId, summaryMap etc.
    } catch (err) {
      console.error(err);
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

  return { data, page, totalPages, total, loading, fetchPage, extra, setData };
}