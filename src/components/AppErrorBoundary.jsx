import { Component } from "react";
import { useLocation, Link } from "react-router-dom";

// Nothing in the app previously caught render-time crashes, so one thrown
// inside a route (e.g. the annotated-PDF preview mid save-and-regenerate)
// unmounted the whole React tree and left the bare <body> showing — the
// dark theme's background (#2E4250) reads as a "blue screen" with no way
// back except a hard refresh. This catches that instead.
class ErrorBoundaryImpl extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("[AppErrorBoundary]", error, info?.componentStack);
  }

  componentDidUpdate(prevProps) {
    // Clear the crash once navigation actually moves away from the route
    // that threw, so children mount fresh on the new route. Doing this here
    // (rather than via `key={pathname}` on the wrapper) means normal
    // navigation — which changes pathname on every click — never remounts
    // the whole app; only a real recovery-from-crash does.
    if (this.state.error && prevProps.pathname !== this.props.pathname) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
            textAlign: "center",
            background: "var(--background, #2E4250)",
            color: "var(--text-primary, #fff)",
          }}
        >
          <div style={{ maxWidth: 420 }}>
            <h2 style={{ marginBottom: 8 }}>Something went wrong</h2>
            <p style={{ opacity: 0.85, marginBottom: 20 }}>
              This page hit an unexpected error. Your edits up to the last successful
              save are safe.
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
              <Link
                to="/"
                style={{
                  padding: "10px 18px",
                  borderRadius: 8,
                  background: "var(--primary, #4C7A9E)",
                  color: "#fff",
                  textDecoration: "none",
                }}
              >
                Go to dashboard
              </Link>
              <button
                type="button"
                onClick={() => window.location.reload()}
                style={{
                  padding: "10px 18px",
                  borderRadius: 8,
                  border: "1px solid rgba(255,255,255,0.4)",
                  background: "transparent",
                  color: "inherit",
                  cursor: "pointer",
                }}
              >
                Reload page
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * Resets on route change so navigating away from a crashed route —
 * including with the browser back button, or the "Go to dashboard" link in
 * the fallback above — recovers the app without a full page reload.
 *
 * Deliberately NOT a `key={pathname}` on the wrapper: this component sits
 * near the root of the whole app, and keying it on pathname would remount
 * every provider, sidebar and page on every single navigation — every
 * sidebar click looked like a full page refresh. Passing `pathname` as a
 * normal prop and clearing the error in `componentDidUpdate` gets the same
 * crash-recovery behavior without remounting anything during ordinary
 * navigation.
 */
export default function AppErrorBoundary({ children }) {
  const location = useLocation();
  return (
    <ErrorBoundaryImpl pathname={location.pathname}>{children}</ErrorBoundaryImpl>
  );
}
