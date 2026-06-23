export default function Pagination({ page, totalPages, onPageChange }) {
  if (totalPages <= 1) return null;

  const getPages = () => {
    const pages = [];

    if (totalPages <= 7) {
      // show all pages
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      // always show first, last, current, and neighbors
      const near = new Set([1, totalPages, page, page - 1, page + 1]);
      const sorted = [...near].filter(p => p >= 1 && p <= totalPages).sort((a, b) => a - b);

      for (let i = 0; i < sorted.length; i++) {
        if (i > 0 && sorted[i] - sorted[i - 1] > 1) {
          pages.push("..."); // gap
        }
        pages.push(sorted[i]);
      }
    }

    return pages;
  };

  const btnStyle = (isActive) => ({
    opacity: isActive ? 1 : 0.5,
    fontWeight: isActive ? "bold" : "normal",
    outline: isActive ? "1px solid white" : "none",
    fontSize: 13,
    padding: "4px 10px",
  });

//   return (
//     <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 8, marginTop: 24, flexWrap: "wrap" }}>
//       <button
//         className="pm-back"
//         onClick={() => onPageChange(page - 1)}
//         disabled={page === 1}
//       >
//         ← Prev
//       </button>

//       {getPages().map((p, i) =>
//         p === "..." ? (
//           <span key={`gap-${i}`} style={{ opacity: 0.4, padding: "0 4px" }}>...</span>
//         ) : (
//           <button
//             key={p}
//             className="pm-back"
//             onClick={() => onPageChange(p)}
//             disabled={p === page}
//             style={{
//               opacity: p === page ? 1 : 0.5,
//               fontWeight: p === page ? "bold" : "normal",
//               outline: p === page ? "1px solid white" : "none"
//             }}
//           >
//             {p}
//           </button>
//         )
//       )}

//       <button
//         className="pm-back"
//         onClick={() => onPageChange(page + 1)}
//         disabled={page === totalPages}
//       >
//         Next →
//       </button>
//     </div>
//   );
  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 4, marginTop: 24, flexWrap: "wrap" }}>
      <button
        className="pm-back"
        onClick={() => onPageChange(page - 1)}
        disabled={page === 1}
        style={btnStyle(false)}
      >
        ← Prev
      </button>

      {getPages().map((p, i) =>
        p === "..." ? (
          <span key={`gap-${i}`} style={{ opacity: 0.4, padding: "0 2px", fontSize: 13 }}>...</span>
        ) : (
          <button
            key={p}
            className="pm-back"
            onClick={() => onPageChange(p)}
            disabled={p === page}
            style={btnStyle(p === page)}
          >
            {p}
          </button>
        )
      )}

      <button
        className="pm-back"
        onClick={() => onPageChange(page + 1)}
        disabled={page === totalPages}
        style={btnStyle(false)}
      >
        Next →
      </button>
    </div>
  );
}