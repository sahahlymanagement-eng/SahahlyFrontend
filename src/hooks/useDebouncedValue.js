// Ali Nassef: Wait for typing to settle; clear immediately when the scope changes.
import { useEffect, useState } from "react";

export default function useDebouncedValue(value, delay = 300, scope = null) {
  const [settled, setSettled] = useState({ value, scope });
  useEffect(() => {
    const timer = setTimeout(() => setSettled({ value, scope }), delay);
    return () => clearTimeout(timer);
  }, [value, delay, scope]);
  return value === "" || settled.scope !== scope ? "" : settled.value;
}
