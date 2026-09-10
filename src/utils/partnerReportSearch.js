// Ali Nassef: Literal, case-insensitive matching across explicitly searchable fields.
export function matchesReportSearch(query, values) {
  const normalize = (value) => String(value ?? "").normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
  const terms = normalize(query).split(" ").filter(Boolean);
  const text = values.map(normalize).join(" ");
  return terms.every((term) => text.includes(term));
}
