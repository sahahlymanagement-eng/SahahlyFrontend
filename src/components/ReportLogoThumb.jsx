import { useEffect, useState } from "react";
import { reportLogoObjectUrl } from "../api/reportLogos";
import "./LogoPicker.css";

/**
 * Read-only thumbnail of an owner's report logo, for list rows.
 *
 * Always requests the `pdf` variant — the small PNG the reports embed — because a
 * grid renders one of these per row and the original upload can be 2 MB.
 *
 * Renders nothing at all when `present` is false, so a page that already knows
 * which owners have logos (from listReportLogos) makes zero requests for the rest.
 */
export default function ReportLogoThumb({ ownerType, ownerKey, present = true, stamp }) {
  // The object URL is tagged with what it was fetched for and read back only while
  // that tag matches, so a replaced logo cannot show its predecessor and the effect
  // needs no synchronous setState to clear it.
  // `stamp` is the row's updatedAt — it changes when the logo is replaced.
  const key = present && ownerKey ? `${ownerType}:${ownerKey}:${stamp || ""}` : null;
  const [held, setHeld] = useState({ key: null, url: null });

  useEffect(() => {
    if (!key) return undefined;
    let alive = true;
    let objectUrl = null;
    reportLogoObjectUrl(ownerType, ownerKey, { variant: "pdf" })
      .then((fetched) => {
        if (!alive) {
          URL.revokeObjectURL(fetched);
          return;
        }
        objectUrl = fetched;
        setHeld({ key, url: fetched });
      })
      .catch(() => {
        // A missing thumbnail is cosmetic — the empty slot is a fine fallback.
      });
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [key, ownerType, ownerKey]);

  if (!present) return <span className="lp-thumb-dash">—</span>;

  const url = held.key === key ? held.url : null;

  return (
    <span className="lp-thumb lp-thumb--sm">
      {url ? <img src={url} alt="" className="lp-thumb-img" /> : null}
    </span>
  );
}
