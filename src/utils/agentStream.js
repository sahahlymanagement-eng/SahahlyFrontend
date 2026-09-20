/**
 * Consumes an AI Agent SSE turn (POST body + streamed `text/event-stream`
 * response — a plain EventSource can't do this since it only supports GET).
 * Emits "progress" events while the agent works through tool calls, then a
 * single "final" event with the same {reply, matched, actionProposal} shape
 * the old plain-JSON /agent endpoint returned.
 */

const API_BASE =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_BASE_URL) ||
  "http://localhost:6001/api";

export async function streamAgentTurn(path, body, { onProgress, onFinal, onError, signal } = {}) {
  const token = localStorage.getItem("token");
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch {
    onError?.({ message: "Could not reach the assistant. Please try again." });
    return;
  }

  if (!response.ok || !response.body) {
    let message = "Something went wrong reaching the assistant.";
    try {
      const data = await response.json();
      message = data.message || message;
    } catch {
      /* body wasn't JSON — keep the generic message */
    }
    onError?.({ message });
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let sepIndex;
      while ((sepIndex = buffer.indexOf("\n\n")) !== -1) {
        const rawEvent = buffer.slice(0, sepIndex);
        buffer = buffer.slice(sepIndex + 2);
        const eventMatch = rawEvent.match(/^event:\s*(.+)$/m);
        const dataMatch = rawEvent.match(/^data:\s*(.+)$/m);
        if (!dataMatch) continue;

        let data;
        try {
          data = JSON.parse(dataMatch[1]);
        } catch {
          continue;
        }

        const eventType = eventMatch?.[1]?.trim() || "message";
        if (eventType === "progress") onProgress?.(data);
        else if (eventType === "final") onFinal?.(data);
        else if (eventType === "error") onError?.(data);
      }
    }
  } catch (err) {
    if (err?.name !== "AbortError") {
      onError?.({ message: "Connection to the assistant was interrupted." });
    }
  }
}

/** Reveals `fullText` a few characters at a time via `onTick`, then calls `onDone`. */
export function revealText(fullText, onTick, onDone) {
  const text = String(fullText || "");
  if (!text) {
    onTick("");
    onDone();
    return () => {};
  }
  let i = 0;
  const step = Math.max(1, Math.ceil(text.length / 90));
  const timer = setInterval(() => {
    i += step;
    if (i >= text.length) {
      onTick(text);
      clearInterval(timer);
      onDone();
    } else {
      onTick(text.slice(0, i));
    }
  }, 16);
  return () => clearInterval(timer);
}
