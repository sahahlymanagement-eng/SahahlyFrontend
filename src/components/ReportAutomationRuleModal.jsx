import { useEffect, useState } from "react";
import { FiX } from "react-icons/fi";
import { toast } from "react-toastify";
import WhatsAppDestinationPicker from "./WhatsAppDestinationPicker";
import {
  listReportAutomationRules,
  saveReportAutomationRule,
  reportAutomationRuleErr,
} from "../api/reportAutomationRules";
import "./ReportAutomationRuleModal.css";

const REPORT_TYPE_LABELS = {
  custom_collective: "assignment report",
  executive_teacher: "teacher executive report",
  monthly_parent: "monthly parent report",
};

const emptyForm = {
  enabled: true,
  destinationType: "group",
  destinationValue: "",
  destinationLabel: "",
  delayHours: 3,
  monthlyTriggerDay: 1,
};

/**
 * Standing "auto-send" rule editor for one classroom + report type.
 * Assignment/teacher-executive reports fire after each assignment's due date
 * (plus a delay, to let marking finish); monthly parent reports fire on a
 * chosen day of the month and always go to each student's own parent contact.
 */
/**
 * Mount/unmount this from the parent (`{modalOpen && <ReportAutomationRuleModal .../>}`)
 * rather than passing an `open` prop — a fresh mount is what resets the loading state
 * each time it's reopened.
 */
export default function ReportAutomationRuleModal({
  classroomId,
  classroomName,
  reportType,
  onClose,
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const isDestinationBased = reportType !== "monthly_parent";

  useEffect(() => {
    if (!classroomId) return;
    let alive = true;
    listReportAutomationRules({ classroomId })
      .then((rules) => {
        if (!alive) return;
        const existing = rules.find((r) => r.reportType === reportType);
        if (existing) {
          setForm({
            enabled: existing.enabled !== false,
            destinationType: existing.destinationType || "group",
            destinationValue: existing.destinationValue || "",
            destinationLabel: existing.destinationLabel || "",
            delayHours: Math.round((existing.delayMinutes ?? 180) / 60),
            monthlyTriggerDay: existing.monthlyTriggerDay || 1,
          });
        } else {
          setForm(emptyForm);
        }
      })
      .catch((err) => toast.error(reportAutomationRuleErr(err, "Failed to load auto-send rule")))
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [classroomId, reportType]);

  const handleSave = async () => {
    if (isDestinationBased && form.enabled && !form.destinationValue) {
      toast.warn("Choose a destination group or phone number first");
      return;
    }

    setSaving(true);
    try {
      await saveReportAutomationRule({
        classroomId,
        reportType,
        enabled: form.enabled,
        destinationType: isDestinationBased ? form.destinationType : undefined,
        destinationValue: isDestinationBased ? form.destinationValue : undefined,
        destinationLabel: isDestinationBased ? form.destinationLabel : undefined,
        delayMinutes: isDestinationBased ? form.delayHours * 60 : undefined,
        monthlyTriggerDay: !isDestinationBased ? form.monthlyTriggerDay : undefined,
      });
      toast.success("Auto-send rule saved");
      onClose();
    } catch (err) {
      toast.error(reportAutomationRuleErr(err, "Failed to save auto-send rule"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rarm-overlay" onClick={onClose}>
      <div className="rarm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="rarm-header">
          <div>
            <span className="rarm-title">Auto-send after {isDestinationBased ? "deadline" : "start of month"}</span>
            <span className="rarm-subtitle">
              {classroomName ? `${classroomName} — ` : ""}
              {REPORT_TYPE_LABELS[reportType] || reportType}
            </span>
          </div>
          <button type="button" className="rarm-close" onClick={onClose} aria-label="Close">
            <FiX size={18} />
          </button>
        </div>

        <div className="rarm-body">
          {loading ? (
            <p className="rarm-hint">Loading…</p>
          ) : (
            <>
              <label className="rarm-toggle">
                <input
                  type="checkbox"
                  checked={form.enabled}
                  onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
                />
                <span>
                  {isDestinationBased
                    ? "Automatically send this classroom's report after each assignment's deadline"
                    : "Automatically send this classroom's monthly parent reports every month"}
                </span>
              </label>

              {isDestinationBased ? (
                <>
                  <WhatsAppDestinationPicker
                    value={form}
                    onChange={(next) => setForm((f) => ({ ...f, ...next }))}
                    disabled={!form.enabled}
                  />
                  <label className="rarm-field">
                    <span className="rarm-label">Hours after deadline</span>
                    <input
                      type="number"
                      min={0}
                      max={72}
                      className="rarm-input"
                      value={form.delayHours}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, delayHours: Math.max(0, Number(e.target.value) || 0) }))
                      }
                      disabled={!form.enabled}
                    />
                  </label>
                  <p className="rarm-hint">
                    Waiting gives the marking automation time to finish grading before the report goes out.
                  </p>
                </>
              ) : (
                <>
                  <label className="rarm-field">
                    <span className="rarm-label">Day of month</span>
                    <input
                      type="number"
                      min={1}
                      max={28}
                      className="rarm-input"
                      value={form.monthlyTriggerDay}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          monthlyTriggerDay: Math.min(28, Math.max(1, Number(e.target.value) || 1)),
                        }))
                      }
                      disabled={!form.enabled}
                    />
                  </label>
                  <p className="rarm-hint">
                    Each student's report still goes to that student's own parent contact — this just
                    automates the monthly bulk send instead of a manual click.
                  </p>
                </>
              )}
            </>
          )}
        </div>

        <div className="rarm-footer">
          <button type="button" className="rarm-btn rarm-btn--ghost" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            type="button"
            className="rarm-btn rarm-btn--primary"
            onClick={handleSave}
            disabled={saving || loading}
          >
            {saving ? "Saving…" : "Save rule"}
          </button>
        </div>
      </div>
    </div>
  );
}
