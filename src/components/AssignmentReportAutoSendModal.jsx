import { useCallback, useEffect, useState } from "react";
import { toast } from "react-toastify";
import { FiClock, FiInfo, FiTrash2, FiX } from "react-icons/fi";
import WhatsAppDestinationPicker from "./WhatsAppDestinationPicker";
import {
  deleteReportAutomationRule,
  listReportAutomationRules,
  reportAutomationRuleErr,
  saveReportAutomationRule,
} from "../api/reportAutomationRules";
import { confirmToast } from "../utils/confirmToast";
import "./PartnerReports.css";

/**
 * Auto-send settings for the Assignment Reports tab — a classroom-scoped
 * counterpart of PartnerReportAutoSendModal, sharing its list-and-edit UI.
 *
 * Two independent standing rules per classroom: the collective PDF (one file
 * to a chosen group/phone) and the personalized reports (one message per
 * student, to that student's own saved contact — no destination to pick).
 * A student who isn't graded yet when the timer fires is skipped and picked
 * up automatically on a later tick once their paper is marked.
 */

const REPORT_TYPES = [
  {
    key: "custom_collective",
    label: "Collective report → group",
    help: "One PDF listing every student's mark on the assignment, sent to a WhatsApp group or phone once the due date has passed.",
    needsDestination: true,
  },
  {
    key: "assignment_parent",
    label: "Personalized reports → each student",
    help: "One report per student, sent to their saved parent number (or their own) once the due date has passed. A student not yet graded is simply skipped and sent automatically once their paper is marked.",
    needsDestination: false,
  },
];

const emptyDraft = {
  enabled: true,
  destinationType: "group",
  destinationValue: "",
  destinationLabel: "",
  delayHours: 3,
};

function draftFromRule(rule) {
  if (!rule) return { ...emptyDraft };
  return {
    enabled: rule.enabled !== false,
    destinationType: rule.destinationType || "group",
    destinationValue: rule.destinationValue || "",
    destinationLabel: rule.destinationLabel || "",
    delayHours: Math.round((rule.delayMinutes ?? 180) / 60),
  };
}

export default function AssignmentReportAutoSendModal({ classroomId, classroomName, onClose }) {
  const [loading, setLoading] = useState(true);
  const [rules, setRules] = useState([]);
  const [openType, setOpenType] = useState(null);
  const [draft, setDraft] = useState({ ...emptyDraft });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRules(await listReportAutomationRules({ classroomId }));
    } catch (err) {
      toast.error(reportAutomationRuleErr(err, "Failed to load auto-send rules"));
      setRules([]);
    } finally {
      setLoading(false);
    }
  }, [classroomId]);

  useEffect(() => {
    load();
  }, [load]);

  const ruleFor = (key) => rules.find((r) => r.reportType === key) || null;

  const openEditor = (type) => {
    setOpenType(type.key);
    setDraft(draftFromRule(ruleFor(type.key)));
  };

  const save = async (type) => {
    if (type.needsDestination && !draft.destinationValue.trim()) {
      toast.warn("Enter the WhatsApp group id or phone number to send to");
      return;
    }

    setSaving(true);
    try {
      await saveReportAutomationRule({
        classroomId,
        reportType: type.key,
        enabled: draft.enabled,
        delayMinutes: Math.max(0, Number(draft.delayHours) || 0) * 60,
        ...(type.needsDestination
          ? {
              destinationType: draft.destinationType,
              destinationValue: draft.destinationValue.trim(),
              destinationLabel: draft.destinationLabel.trim() || null,
            }
          : {}),
      });
      toast.success(`Auto-send saved for ${type.label}`);
      setOpenType(null);
      await load();
    } catch (err) {
      toast.error(reportAutomationRuleErr(err, "Failed to save rule"));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (type) => {
    const rule = ruleFor(type.key);
    if (!rule) return;
    const ok = await confirmToast(`Turn off auto-send for "${type.label}"?`);
    if (!ok) return;
    try {
      await deleteReportAutomationRule(rule._id);
      toast.success("Auto-send turned off");
      setOpenType(null);
      await load();
    } catch (err) {
      toast.error(reportAutomationRuleErr(err, "Failed to remove rule"));
    }
  };

  return (
    <div className="prw-modal-backdrop" role="dialog" aria-modal="true">
      <div className="prw-modal">
        <header className="prw-modal-head">
          <div>
            <h2>
              <FiClock size={15} /> Auto-send — {classroomName || "Assignment Reports"}
            </h2>
            <p className="prw-panel-sub">
              Standing rules that send a report without anybody clicking. Checked every 15
              minutes.
            </p>
          </div>
          <button type="button" className="prw-icon-btn" onClick={onClose} aria-label="Close">
            <FiX size={16} />
          </button>
        </header>

        <div className="prw-modal-body">
          <p className="prw-note">
            <FiInfo size={13} /> A rule fires once an assignment&apos;s due date plus the delay
            has passed. The delay is what gives marking time to finish. Nothing is ever sent
            twice.
          </p>

          {loading ? (
            <p className="prw-empty">Loading rules…</p>
          ) : (
            <ul className="prw-rule-list">
              {REPORT_TYPES.map((type) => {
                const rule = ruleFor(type.key);
                const isOpen = openType === type.key;
                const active = rule && rule.enabled !== false;

                return (
                  <li key={type.key} className="prw-rule">
                    <div className="prw-rule-head">
                      <div className="prw-rule-title">
                        <span>{type.label}</span>
                        <span
                          className={`prw-pill ${active ? "prw-pill--ok" : "prw-pill--muted"}`}
                        >
                          {active ? "On" : rule ? "Paused" : "Off"}
                        </span>
                      </div>
                      <div className="prw-rule-actions">
                        <button
                          type="button"
                          className="prw-btn prw-btn--ghost"
                          onClick={() => (isOpen ? setOpenType(null) : openEditor(type))}
                        >
                          {isOpen ? "Close" : rule ? "Edit" : "Set up"}
                        </button>
                        {rule && (
                          <button
                            type="button"
                            className="prw-icon-btn prw-icon-btn--danger"
                            title="Turn off"
                            onClick={() => remove(type)}
                          >
                            <FiTrash2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>

                    <p className="prw-rule-help">{type.help}</p>

                    {rule && !isOpen && (
                      <p className="prw-rule-summary">
                        {`Fires ${rule.delayMinutes} minute(s) after each assignment's due date.`}
                        {type.needsDestination &&
                          ` → ${rule.destinationLabel || rule.destinationValue}`}
                      </p>
                    )}

                    {isOpen && (
                      <div className="prw-rule-editor">
                        <label className="prw-check">
                          <input
                            type="checkbox"
                            checked={draft.enabled}
                            onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })}
                          />
                          <span>Enabled</span>
                        </label>

                        <label className="prw-field">
                          <span>Hours after the due date</span>
                          <input
                            className="prw-input"
                            type="number"
                            min="0"
                            max="72"
                            value={draft.delayHours}
                            onChange={(e) =>
                              setDraft({ ...draft, delayHours: e.target.value })
                            }
                          />
                        </label>

                        {type.needsDestination && (
                          <WhatsAppDestinationPicker
                            value={draft}
                            onChange={(next) => setDraft((d) => ({ ...d, ...next }))}
                          />
                        )}

                        <div className="prw-rule-editor-actions">
                          <button
                            type="button"
                            className="prw-btn prw-btn--primary"
                            disabled={saving}
                            onClick={() => save(type)}
                          >
                            {saving ? "Saving…" : "Save rule"}
                          </button>
                          <button
                            type="button"
                            className="prw-btn prw-btn--ghost"
                            onClick={() => setOpenType(null)}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
