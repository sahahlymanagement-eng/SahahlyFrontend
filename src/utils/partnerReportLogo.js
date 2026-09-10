/**
 * PDF-ready logo bytes for a grading partner (LoginCSS / Mariam Gabalawy / Dr
 * Peter), cached per slug for the tab's lifetime.
 *
 * Mirrors the assignment-scoped teacher-logo lookup the classroom preview uses
 * (loadAssignmentTeacherLogo in useAnnotatedResultPreview.js) — a partner
 * assignment has no classroom and no teacher account to key a logo off, so the
 * owner is the partner slug instead. See PartnerLogoPanel for the upload side.
 */
const partnerLogoCache = new Map();

/**
 * @param {object} api   axios instance
 * @param {string} slug  "logincss" | "mariamgabalawy" | "drpeter"
 * @returns {Promise<ArrayBuffer|null>}
 */
export async function loadPartnerLogoBytes(api, slug) {
  if (!slug) return null;
  if (!partnerLogoCache.has(slug)) {
    partnerLogoCache.set(
      slug,
      api
        .get(`/report-logos/partner/${slug}`, {
          params: { variant: "pdf" },
          responseType: "arraybuffer",
        })
        .then((r) => r.data)
        .catch((err) => {
          if (err?.response?.status !== 404) {
            console.warn("Unable to load partner PDF logo", err);
          }
          return null;
        })
    );
  }
  return partnerLogoCache.get(slug);
}
