import "../styles/ui-polish.css";

export default function Pagination({ page, totalPages, onPageChange }) {
  if (totalPages <= 1) return null;

  const getPages = () => {
    const pages = [];

    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      const near = new Set([1, totalPages, page, page - 1, page + 1]);
      const sorted = [...near].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);

      for (let i = 0; i < sorted.length; i++) {
        if (i > 0 && sorted[i] - sorted[i - 1] > 1) {
          pages.push("...");
        }
        pages.push(sorted[i]);
      }
    }

    return pages;
  };

  return (
    <nav className="sah-pagination" aria-label="Pagination">
      <button
        type="button"
        className="sah-pagination-btn"
        onClick={() => onPageChange(page - 1)}
        disabled={page === 1}
        aria-label="Previous page"
      >
        ← Prev
      </button>

      {getPages().map((p, i) =>
        p === "..." ? (
          <span key={`gap-${i}`} className="sah-pagination-gap" aria-hidden>
            …
          </span>
        ) : (
          <button
            key={p}
            type="button"
            className={`sah-pagination-btn${p === page ? " sah-pagination-btn--active" : ""}`}
            onClick={() => onPageChange(p)}
            disabled={p === page}
            aria-label={`Page ${p}`}
            aria-current={p === page ? "page" : undefined}
          >
            {p}
          </button>
        )
      )}

      <button
        type="button"
        className="sah-pagination-btn"
        onClick={() => onPageChange(page + 1)}
        disabled={page === totalPages}
        aria-label="Next page"
      >
        Next →
      </button>
    </nav>
  );
}
