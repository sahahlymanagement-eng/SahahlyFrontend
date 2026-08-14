import { useMemo, useState } from "react";

function startOfMonth(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function toYmd(date) {
  if (!date) return "";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function useDashboardPeriod() {
  const [from, setFrom] = useState(() => startOfMonth());
  const [to, setTo] = useState(() => endOfMonth());

  const params = useMemo(
    () => ({
      from: toYmd(from),
      to: toYmd(to),
    }),
    [from, to]
  );

  const resetToThisMonth = () => {
    setFrom(startOfMonth());
    setTo(endOfMonth());
  };

  const monthLabel = useMemo(() => {
    const d = from || new Date();
    return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  }, [from]);

  return { from, to, setFrom, setTo, params, resetToThisMonth, monthLabel };
}

export { startOfMonth, endOfMonth, toYmd };
