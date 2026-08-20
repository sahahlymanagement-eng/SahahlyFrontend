import { sortStudentsBySubmittedAt } from "./sortStudentsBySubmittedAt";

/**
 * Fetch every page from a paginated list endpoint and return the combined items.
 * When items look like submission-viewer rows, re-sort by submittedAt so order
 * stays correct across page boundaries even if a page was locally mutated.
 */
export async function fetchAllPaginated(
  apiClient,
  url,
  params = {},
  dataKey = "data",
  pageSize = 100
) {
  const all = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const res = await apiClient.get(url, {
      params: { ...params, page, limit: pageSize },
    });
    const items = res.data[dataKey] || [];
    all.push(...items);
    totalPages = res.data.totalPages || 1;
    page += 1;
  }

  const looksLikeSubmissionRows = all.some(
    (row) =>
      row &&
      (row.submittedAt != null ||
        row.submission_date != null ||
        row.submissionId != null)
  );
  return looksLikeSubmissionRows ? sortStudentsBySubmittedAt(all) : all;
}
