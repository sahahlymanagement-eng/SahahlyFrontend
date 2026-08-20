/**
 * The paper's exam identity: board, paper code, paper number.
 *
 * One definition shared by both editors — the classroom bar
 * (ClassroomPaperMetadataBar) and the partner bar
 * (GradingAssignmentSettingsBar). The two write to different endpoints because a
 * partner assignment has no Assignment document, but they must offer the same
 * three fields under the same labels: they feed one collection
 * (savedcorrectiondatas), and a board typed as "Cambridge" on one side and
 * "CIE" on the other silently splits every report by paper.
 *
 * Free text, deliberately. A board enum would need a migration per syllabus, and
 * a paper code is whatever string the exam board prints. Nothing detects any of
 * it — these are typed once per assignment, and every corrected question
 * recorded afterwards carries a copy.
 */

export const PAPER_METADATA_FIELDS = [
  {
    key: "board",
    label: "🏛 Board",
    placeholder: "e.g. Cambridge",
    width: 130,
  },
  {
    key: "paperCode",
    label: "🔖 Paper code",
    placeholder: "e.g. 0625/42",
    width: 110,
  },
  {
    key: "paperNumber",
    label: "📘 Paper",
    placeholder: "e.g. 4",
    width: 60,
  },
];

/** Draft state for the editor, seeded from saved values ("" for unset). */
export function paperMetadataDraft(source) {
  return Object.fromEntries(
    PAPER_METADATA_FIELDS.map(({ key }) => [key, source?.[key] ?? ""])
  );
}

/**
 * Draft state as a request body.
 *
 * Empty text becomes null rather than "": both read as unset to the backend, but
 * null is what every other unset value in this codebase is, and it is what the
 * SavedCorrectionData rows should carry so a filter on "board is not set" works.
 */
export function paperMetadataPatch(draft) {
  return Object.fromEntries(
    PAPER_METADATA_FIELDS.map(({ key }) => {
      const value = String(draft?.[key] ?? "").trim();
      return [key, value === "" ? null : value];
    })
  );
}

/** True when at least one field has a value — "Edit" vs "Set" on the button. */
export function hasPaperMetadata(source) {
  return PAPER_METADATA_FIELDS.some(({ key }) => {
    const value = source?.[key];
    return value !== null && value !== undefined && value !== "";
  });
}
