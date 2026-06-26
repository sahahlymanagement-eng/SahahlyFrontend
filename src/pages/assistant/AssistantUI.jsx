import { useNavigate } from "react-router-dom";
import { FiArrowLeft, FiChevronRight } from "react-icons/fi";

export function AssistantPageHeader({
  eyebrow,
  title,
  subtitle,
  backTo,
  backLabel = "Back",
  breadcrumbs = [],
  actions,
}) {
  const navigate = useNavigate();

  return (
    <header className="ast-page-header">
      {(breadcrumbs.length > 0 || backTo) && (
        <nav className="ast-breadcrumb" aria-label="Breadcrumb">
          {backTo ? (
            <button type="button" onClick={() => navigate(backTo)}>
              {backLabel}
            </button>
          ) : null}
          {breadcrumbs.map((crumb, i) => (
            <span key={crumb.label} style={{ display: "contents" }}>
              {(backTo || i > 0) && <span className="ast-breadcrumb-sep">/</span>}
              {crumb.to ? (
                <button type="button" onClick={() => navigate(crumb.to)}>
                  {crumb.label}
                </button>
              ) : (
                <span className="ast-breadcrumb-current">{crumb.label}</span>
              )}
            </span>
          ))}
        </nav>
      )}

      <div className="ast-page-header-row">
        <div>
          {eyebrow ? <div className="ast-page-eyebrow">{eyebrow}</div> : null}
          <h1 className="ast-page-title">{title}</h1>
          {subtitle ? <p className="ast-page-subtitle">{subtitle}</p> : null}
        </div>
        {actions ? <div className="ast-page-actions">{actions}</div> : null}
      </div>
    </header>
  );
}

export function AssistantLoading({ message = "Loading…" }) {
  return (
    <div className="ast-loading">
      <div className="ast-spinner" />
      <span>{message}</span>
    </div>
  );
}

export function AssistantEmpty({ title, description }) {
  return (
    <div className="ast-empty">
      {title ? <strong style={{ display: "block", marginBottom: 6, color: "#e2e8f0" }}>{title}</strong> : null}
      {description}
    </div>
  );
}

export function AssistantActionLink() {
  return (
    <span className="ast-action-card-arrow">
      <FiChevronRight size={18} />
    </span>
  );
}

export function AssistantBackButton({ onClick, label = "Back" }) {
  return (
    <button type="button" className="ast-btn ast-btn--ghost" onClick={onClick}>
      <FiArrowLeft size={15} />
      {label}
    </button>
  );
}
