import { useNavigate } from "react-router-dom";
import { FiArrowLeft, FiChevronRight } from "react-icons/fi";

export function TeacherPageHeader({
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
    <header className="tch-page-header">
      {(breadcrumbs.length > 0 || backTo) && (
        <nav className="tch-breadcrumb" aria-label="Breadcrumb">
          {backTo ? (
            <button type="button" onClick={() => navigate(backTo)}>
              {backLabel}
            </button>
          ) : null}
          {breadcrumbs.map((crumb, i) => (
            <span key={crumb.label} style={{ display: "contents" }}>
              {(backTo || i > 0) && <span className="tch-breadcrumb-sep">/</span>}
              {crumb.to ? (
                <button type="button" onClick={() => navigate(crumb.to)}>
                  {crumb.label}
                </button>
              ) : (
                <span className="tch-breadcrumb-current">{crumb.label}</span>
              )}
            </span>
          ))}
        </nav>
      )}

      <div className="tch-page-header-row">
        <div>
          {eyebrow ? <div className="tch-page-eyebrow">{eyebrow}</div> : null}
          <h1 className="tch-page-title">{title}</h1>
          {subtitle ? <p className="tch-page-subtitle">{subtitle}</p> : null}
        </div>
        {actions ? <div className="tch-page-actions">{actions}</div> : null}
      </div>
    </header>
  );
}

export function TeacherLoading({ message = "Loading…" }) {
  return (
    <div className="tch-loading">
      <div className="tch-spinner" />
      <span>{message}</span>
    </div>
  );
}

export function TeacherEmpty({ icon, title, description, action }) {
  return (
    <div className="tch-empty">
      {icon ? <div className="tch-empty-icon">{icon}</div> : null}
      <h3>{title}</h3>
      {description ? <p>{description}</p> : null}
      {action}
    </div>
  );
}

export function TeacherBackButton({ onClick, label = "Back" }) {
  return (
    <button type="button" className="tch-back-btn" onClick={onClick}>
      <FiArrowLeft size={15} />
      {label}
    </button>
  );
}

export function TeacherActionLink({ children }) {
  return (
    <span className="tch-action-card-link">
      {children}
      <FiChevronRight size={14} />
    </span>
  );
}
