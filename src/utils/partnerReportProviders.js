/**
 * Grading-partner slug -> display label + IGSpaces-connection flag, shared by
 * PartnerReportsWorkspace.jsx and PartnerPublishJobQueue.jsx. Kept in its own
 * (non-component) file rather than exported from PartnerReportsWorkspace.jsx
 * itself — a component file may only export components, or React Fast
 * Refresh stops working for it.
 *
 * `igspacesConnected` mirrors src/config/gradingProviders.js on the backend —
 * mariamgabalawy and drpeter publish assignment/monthly reports THROUGH
 * IGSpaces (R2 upload + payload with a URL) instead of WhatsApp, and only
 * they have a live roster for the Submission Status view. LoginCSS has no
 * IGSpaces platform behind it, so it keeps using WhatsApp for every report
 * kind exactly as before.
 */
export const PARTNERS = [
  { slug: "logincss", label: "LoginCSS", igspacesConnected: false },
  { slug: "mariamgabalawy", label: "Mariam Gabalawy", igspacesConnected: true },
  { slug: "drpeter", label: "Dr Peter", igspacesConnected: true },
];
