import { FiCalendar, FiClipboard, FiUsers } from "react-icons/fi";
import Pagination from "../Pagination";

/**
 * Classroom → assignment picker, mirroring the Submission Viewer's flow: pick
 * one and the column collapses to a single line with a [change] link, so the
 * chosen target stays visible without eating the room the roster needs.
 *
 * Assistants have no classroom step — their assignment list is already scoped
 * to them — so the classroom column is driven off `classrooms` being present
 * rather than a separate scope flag.
 */

function CollapsedRow({ label, value, onChange }) {
  return (
    <div
      className="atm-collapsed"
      role="button"
      tabIndex={0}
      onClick={onChange}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onChange();
        }
      }}
    >
      <span className="atm-collapsed-label">{label}</span>
      <span className="atm-collapsed-value">{value}</span>
      <span className="atm-collapsed-change">[change]</span>
    </div>
  );
}

function PickerColumn({
  title,
  placeholder,
  search,
  onSearch,
  list,
  loading,
  emptyText,
  page,
  totalPages,
  onPageChange,
  renderItem,
  itemKey,
  onPick,
  activeId,
}) {
  return (
    <div className="atm-column">
      <p className="atm-column-title">{title}</p>
      <input
        className="sah-input"
        placeholder={placeholder}
        value={search}
        onChange={(e) => onSearch(e.target.value)}
      />
      <div className="atm-scroll-list">
        {loading && !list.length ? (
          <p className="atm-empty">Loading…</p>
        ) : !list.length ? (
          <p className="atm-empty">{emptyText}</p>
        ) : (
          list.map((item) => (
            <button
              type="button"
              key={itemKey(item)}
              className={`atm-pick${activeId === itemKey(item) ? " atm-pick--active" : ""}`}
              onClick={() => onPick(item)}
            >
              {renderItem(item)}
            </button>
          ))
        )}
      </div>
      <Pagination page={page} totalPages={totalPages} onPageChange={onPageChange} />
    </div>
  );
}

export default function AutomationTargetPicker({
  classrooms,
  selectedClassroom,
  onPickClassroom,
  onChangeClassroom,
  assignments,
  selectedAssignment,
  onPickAssignment,
  onChangeAssignment,
}) {
  const showAssignments = !classrooms || !!selectedClassroom;

  return (
    <section className="atm-card">
      <header className="atm-card-header">
        <h2 className="atm-card-title">
          <FiClipboard aria-hidden="true" /> Target
        </h2>
      </header>

      <div className="atm-picker">
        {classrooms &&
          (selectedClassroom ? (
            <CollapsedRow
              label="Classroom"
              value={selectedClassroom.name}
              onChange={onChangeClassroom}
            />
          ) : (
            <PickerColumn
              title="Select classroom"
              placeholder="Search classrooms…"
              search={classrooms.search}
              onSearch={classrooms.onSearch}
              list={classrooms.items}
              loading={classrooms.loading}
              emptyText="No classrooms found"
              page={classrooms.page}
              totalPages={classrooms.totalPages}
              onPageChange={classrooms.onPageChange}
              itemKey={(c) => c._id}
              activeId={selectedClassroom?._id}
              onPick={onPickClassroom}
              renderItem={(c) => (
                <>
                  <span className="atm-pick-icon">
                    <FiUsers size={14} aria-hidden="true" />
                  </span>
                  <span className="atm-pick-body">
                    <span className="atm-pick-title">{c.name}</span>
                    {(c.section || c.teacherId?.name) && (
                      <span className="atm-pick-meta">
                        {[c.section, c.teacherId?.name].filter(Boolean).join(" · ")}
                      </span>
                    )}
                  </span>
                </>
              )}
            />
          ))}

        {showAssignments &&
          (selectedAssignment ? (
            <CollapsedRow
              label="Assignment"
              value={selectedAssignment.title}
              onChange={onChangeAssignment}
            />
          ) : (
            <PickerColumn
              title="Select assignment"
              placeholder="Search assignments…"
              search={assignments.search}
              onSearch={assignments.onSearch}
              list={assignments.items}
              loading={assignments.loading}
              emptyText="No assignments found"
              page={assignments.page}
              totalPages={assignments.totalPages}
              onPageChange={assignments.onPageChange}
              itemKey={(a) => a._id}
              activeId={selectedAssignment?._id}
              onPick={onPickAssignment}
              renderItem={(a) => (
                <>
                  <span className="atm-pick-icon">
                    <FiClipboard size={13} aria-hidden="true" />
                  </span>
                  <span className="atm-pick-body">
                    <span className="atm-pick-title">{a.title}</span>
                    <span className="atm-pick-meta">
                      {a.classroomId?.name ? `${a.classroomId.name} · ` : ""}
                      {a.dueDate ? (
                        <>
                          <FiCalendar size={10} aria-hidden="true" /> Due{" "}
                          {new Date(a.dueDate).toLocaleDateString()}
                        </>
                      ) : (
                        "No due date"
                      )}
                    </span>
                  </span>
                </>
              )}
            />
          ))}
      </div>
    </section>
  );
}
