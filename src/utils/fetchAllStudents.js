/**
 * Fetch every page from a paginated list endpoint and return the combined items.
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

  return all;
}
