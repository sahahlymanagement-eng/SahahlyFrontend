/**
 * Fixed, always-visible "N of M staged, please wait" indicator for a
 * Return All / Publish All run.
 *
 * Browsers refuse to show custom text in the native beforeunload dialog
 * (useBeforeUnloadGuard's message is ignored everywhere modern) — every
 * browser shows its own fixed "leave site?" wording instead. So the actual
 * progress has to already be on screen before the user tries to leave, not
 * inside that dialog. This renders fixed to the viewport so it stays visible
 * regardless of scroll position, right up until the run finishes.
 */
export default function StagingProgressBanner({ active, done = 0, total = 0, current = null, label = "Staging" }) {
  if (!active || !total) return null;
  const pct = Math.max(0, Math.min(100, Math.round((done / total) * 100)));

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        left: "50%",
        bottom: 22,
        transform: "translateX(-50%)",
        zIndex: 10000,
        background: "var(--card-bg, #fff)",
        border: "1px solid var(--primary)",
        borderRadius: 12,
        boxShadow: "0 8px 28px rgba(0,0,0,0.22)",
        padding: "12px 18px",
        minWidth: 300,
        maxWidth: "92vw",
        boxSizing: "border-box",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span className="pm-spinner" style={{ width: 14, height: 14, flexShrink: 0 }} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 13 }}>
            {label} {done} of {total}
          </div>
          <div
            style={{
              fontSize: 12,
              color: "var(--muted)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            Please wait before leaving this page{current ? ` · ${current}` : ""}
          </div>
        </div>
      </div>
      <div
        style={{
          marginTop: 8,
          height: 5,
          borderRadius: 3,
          background: "color-mix(in srgb, var(--primary) 15%, transparent)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            background: "var(--primary)",
            transition: "width 0.2s ease",
          }}
        />
      </div>
    </div>
  );
}
