const json = async (res) => {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.message || res.statusText || "Request failed");
  return data;
};

/** Fetch with a hard timeout so hung proxies don't leave the UI on a spinner forever. */
function apiFetch(url, options = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch("/api/drpeter-indexing" + url, { ...options, headers: { ...options.headers, Authorization: `Bearer ${localStorage.getItem("token") || ""}` }, signal: controller.signal })
    .then(async res => new Response(await res.blob(), { status: res.status, statusText: res.statusText, headers: res.headers }))
    .finally(() => clearTimeout(timer))
    .catch((err) => {
      if (err?.name === "AbortError") throw new Error("Request timed out — try again.");
      throw err;
    });
}

export const api = {
  health: () => apiFetch("/api/health").then(json),
  exams: () => apiFetch("/api/exams").then(json),
  exam: (id) => apiFetch(`/api/exams/${id}`).then(json),
  saveGuidance: (id, extraGuidance) => apiFetch(`/api/exams/${id}/guidance`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ extraGuidance }),
  }).then(json),
  createExam: (formData) =>
    apiFetch("/api/exams", { method: "POST", body: formData }, 120000).then(json),
  reprocess: (id, body = {}) =>
    apiFetch(`/api/exams/${id}/reprocess`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }, 120000).then(json),
  repairExam: (id) => apiFetch(`/api/exams/${id}/repair`, { method: "POST" }, 120000).then(json),
  savePack: (id, body) =>
    apiFetch(`/api/exams/${id}/pack`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(json),
  indexChat: (id, formData) =>
    apiFetch(`/api/exams/${id}/index-chat`, { method: "POST", body: formData }, 180000).then(json),
  deleteExam: (id) => apiFetch(`/api/exams/${id}`, { method: "DELETE" }).then(json),
  gradings: (examId) =>
    apiFetch(examId ? `/api/gradings?examId=${encodeURIComponent(examId)}` : "/api/gradings").then(json),
  grading: (id) => apiFetch(`/api/gradings/${id}`).then(json),
  createGrading: (formData) =>
    apiFetch("/api/gradings", { method: "POST", body: formData }, 120000).then(json),
  pricing: () => apiFetch("/api/pricing").then(json),
  models: () => apiFetch("/api/models").then(json),
  runs: (examId) =>
    apiFetch(examId ? `/api/runs?examId=${encodeURIComponent(examId)}` : "/api/runs").then(json),
  run: (id) => apiFetch(`/api/runs/${id}`).then(json),
  createRun: (formData) => apiFetch("/api/runs", { method: "POST", body: formData }, 120000).then(json),
  retryRun: (id) => apiFetch(`/api/runs/${id}/retry`, { method: "POST" }).then(json),
  cancelRun: (id) => apiFetch(`/api/runs/${id}/cancel`, { method: "POST" }).then(json),
  deleteRun: (id) => apiFetch(`/api/runs/${id}`, { method: "DELETE" }).then(json),
  placement: (id) => apiFetch(`/api/gradings/${id}/placement`).then(json),
  savePlacement: (id, body) =>
    apiFetch(`/api/gradings/${id}/placement`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(json),
  resetPlacement: (id) =>
    apiFetch(`/api/gradings/${id}/placement`, { method: "DELETE" }).then(json),
  annotatedPdfUrl: (id, { download = false, revision = 0 } = {}) =>
    `/api/drpeter-indexing/api/gradings/${id}/annotated.pdf?v=${revision}${download ? "&download=1" : ""}`,
};
