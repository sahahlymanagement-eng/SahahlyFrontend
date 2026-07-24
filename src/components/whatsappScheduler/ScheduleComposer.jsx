import { useMemo } from "react";
import Select from "react-select";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { FiEdit2, FiSend, FiX } from "react-icons/fi";
import { selectStyles } from "../../utils/selectTheme";
import {
  DAYS,
  browserTimezone,
  describeRecurrence,
  groupLabel,
  timezoneOptions,
} from "./recurrence";

/**
 * Compose / edit a scheduled message.
 *
 * Fully controlled — the page owns `form` so it can seed it from a table row
 * (Edit) or from a freshly added group without this component remounting and
 * throwing away half-typed text.
 */
export default function ScheduleComposer({
  form,
  onPatch,
  groups,
  editing,
  busy,
  onSubmit,
  onCancelEdit,
}) {
  const groupOptions = useMemo(
    () => groups.map((g) => ({ value: g.chatId, label: groupLabel(g) })),
    [groups]
  );
  const tzOptions = useMemo(() => timezoneOptions(), []);
  const localZone = useMemo(() => browserTimezone(), []);

  const selectedGroup =
    groupOptions.find((o) => o.value === form.chatId) ||
    // An edited message can point at a group that has since been removed.
    (form.chatId ? { value: form.chatId, label: form.chatId } : null);

  // Functional patch: reads the latest days, not this render's copy.
  const toggleDay = (value) => {
    onPatch((prev) => ({
      daysOfWeek: prev.daysOfWeek.includes(value)
        ? prev.daysOfWeek.filter((d) => d !== value)
        : [...prev.daysOfWeek, value],
    }));
  };

  const summary = describeRecurrence({
    recurrence: {
      frequency: form.frequency,
      time: form.time,
      daysOfWeek: form.daysOfWeek,
    },
    timezone: form.timezone,
  });

  return (
    <section className="mws-card" id="mws-composer">
      <header className="mws-card-header">
        <h2 className="mws-card-title">
          {editing ? <FiEdit2 aria-hidden="true" /> : <FiSend aria-hidden="true" />}
          {editing ? "Edit scheduled message" : "Schedule a message"}
        </h2>
        {editing && (
          <button type="button" className="mws-btn mws-btn--ghost" onClick={onCancelEdit}>
            <FiX aria-hidden="true" /> Cancel edit
          </button>
        )}
      </header>

      <form className="mws-form" onSubmit={onSubmit}>
        <label className="mws-field">
          <span className="mws-label">Group</span>
          <Select
            styles={selectStyles}
            menuPortalTarget={document.body}
            options={groupOptions}
            value={selectedGroup}
            onChange={(sel) => onPatch({ chatId: sel?.value || "" })}
            placeholder="Select a group…"
            isDisabled={busy}
            noOptionsMessage={() => "No groups registered yet"}
          />
        </label>

        <label className="mws-field">
          <span className="mws-label">
            Message
            <span className="mws-charcount">{form.text.length} chars</span>
          </span>
          <textarea
            className="mws-textarea"
            rows={5}
            value={form.text}
            onChange={(e) => onPatch({ text: e.target.value })}
            placeholder="Type the message to send…"
          />
        </label>

        <div className="mws-field">
          <span className="mws-label">Schedule</span>
          <div className="mws-segmented" role="group" aria-label="Schedule type">
            <button
              type="button"
              className={`mws-segment ${form.scheduleType === "once" ? "mws-segment--on" : ""}`}
              aria-pressed={form.scheduleType === "once"}
              onClick={() => onPatch({ scheduleType: "once" })}
            >
              Once
            </button>
            <button
              type="button"
              className={`mws-segment ${form.scheduleType === "recurring" ? "mws-segment--on" : ""}`}
              aria-pressed={form.scheduleType === "recurring"}
              onClick={() => onPatch({ scheduleType: "recurring" })}
            >
              Recurring
            </button>
          </div>
        </div>

        {form.scheduleType === "once" ? (
          <div className="mws-field">
            <span className="mws-label">Send at</span>
            <DatePicker
              selected={form.sendAt}
              onChange={(date) => onPatch({ sendAt: date })}
              showTimeSelect
              timeIntervals={5}
              timeFormat="HH:mm"
              dateFormat="Pp"
              minDate={new Date()}
              placeholderText="Pick a date and time"
              className="mws-input"
              portalId="root"
              disabled={busy}
            />
            {/* A one-off is stored as an absolute instant, resolved from this
                browser's clock — so say which zone that is. */}
            <p className="mws-note">
              {form.sendAt
                ? `Sends ${form.sendAt.toLocaleString()}`
                : "Interpreted in your browser's timezone"}
              {localZone ? ` · ${localZone}` : ""}
            </p>
          </div>
        ) : (
          <div className="mws-recurring">
            <label className="mws-field">
              <span className="mws-label">Frequency</span>
              <select
                className="mws-input"
                value={form.frequency}
                onChange={(e) => onPatch({ frequency: e.target.value })}
                disabled={busy}
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
              </select>
            </label>

            <label className="mws-field">
              <span className="mws-label">Time (24h)</span>
              <input
                type="time"
                className="mws-input"
                value={form.time}
                onChange={(e) => onPatch({ time: e.target.value })}
                disabled={busy}
              />
            </label>

            <label className="mws-field mws-field--wide">
              <span className="mws-label">Timezone</span>
              <Select
                styles={selectStyles}
                menuPortalTarget={document.body}
                options={tzOptions}
                value={{ value: form.timezone, label: form.timezone }}
                onChange={(sel) => onPatch({ timezone: sel?.value || form.timezone })}
                isDisabled={busy}
              />
            </label>

            {form.frequency === "weekly" && (
              <div className="mws-field mws-field--wide">
                <span className="mws-label">Days</span>
                <div className="mws-days" role="group" aria-label="Days of week">
                  {DAYS.map((d) => {
                    const on = form.daysOfWeek.includes(d.value);
                    return (
                      <button
                        key={d.value}
                        type="button"
                        className={`mws-day ${on ? "mws-day--on" : ""}`}
                        aria-pressed={on}
                        onClick={() => toggleDay(d.value)}
                        disabled={busy}
                      >
                        {d.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {summary && (
              <p className="mws-field mws-field--wide mws-summary">{summary}</p>
            )}
          </div>
        )}

        <div className="mws-form-actions">
          <button type="submit" className="mws-btn mws-btn--primary" disabled={busy}>
            <FiSend aria-hidden="true" />
            {editing ? "Save changes" : "Schedule send"}
          </button>
        </div>
      </form>
    </section>
  );
}
