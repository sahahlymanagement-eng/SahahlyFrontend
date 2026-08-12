import { useCallback, useEffect, useState } from "react";
import { toast } from "react-toastify";
import { FiClock, FiInfo, FiTrash2, FiX } from "react-icons/fi";
import {
  deletePartnerAutomationRule,
  listPartnerAutomationRules,
  partnerReportErr,
  savePartnerAutomationRule,
} from "../api/partnerReports";
import { confirmToast } from "../utils/confirmToast";

/**
 * Auto-send settings for one grading partner — the partner counterpart of
 * ReportAutomationRuleModal.
 *
 * One standing rule per report type per partner. The two parent-facing types
 * need no destination (each report goes to that student's own saved contact), so
 * their editor shows only the trigger; the three staff-facing types need a
 * WhatsApp group or phone to send to.
 */

const REPORT_TYPES = [
  {
    key: "assignment_parent",
    label: "Assignment reports → parents",
    help: "One report per student, sent to their saved parent number once the assignment's due date has passed.",
    needsDestination: false,
    trigger: "delay",
  },
  {
    key: "monthly_parent",
    label: "Monthly parent reports → parents",
    help: "The full monthly PDF for every student with a saved number, once a month.",
    needsDestination: false,
    trigger: "monthly",
  },
  {
    key: "teacher_collective",
    label: "Teacher collective PDF",
    help: "One PDF listing every student's mark on the assignment.",
    needsDestination: true,
    trigger: "delay",
  },
  {
    key: "custom_collective",
    label: "Custom collective PDF",
    help: "One PDF listing who submitted, without marks.",
    needsDestination: true,
    trigger: "delay",
  },
  {
    key: "executive_teacher",
    label: "Executive analysis",
    help: "The full class-level analysis PDF. Held back until at least one paper on the assignment has been marked.",
    needsDestination: true,
    trigger: "delay",
  },
];

const emptyDraft = {
  enabled: true,
  destinationType: "group",
  destinationValue: "",
  destinationLabel: "",
  delayMinutes: 180,
  monthlyTriggerDay: 1,
};

function draftFromRule(rule) {
  if (!rule) return { ...emptyDraft };
  return {
    enabled: rule.enabled !== false,
    destinationType: rule.destinationType || "group",
    destinationValue: rule.destinationValue || "",
    destinationLabel: rule.destinationLabel || "",
    delayMinutes: rule.delayMinutes ?? 180,
    monthlyTriggerDay: rule.monthlyTriggerDay ?? 1,
  };
}

export default function PartnerReportAutoSendModal({ slug, providerLabel, onClose }) {
  const [loading, setLoading] = useState(true);
  const [rules, setRules] = useState([]);
  const [openType, setOpenType] = useState(null);
  const [draft, setDraft] = useState({ ...emptyDraft });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRules(await listPartnerAutomationRules(slug));
    } catch (err) {
      toast.error(partnerReportErr(err, "Failed to load auto-send rules"));
      setRules([]);
    } finally {
      setLoading(false);
    }
  }, [slug]);

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
      await savePartnerAutomationRule(slug, {
        reportType: type.key,
        enabled: draft.enabled,
        ...(type.needsDestination
          ? {
              destinationType: draft.destinationType,
              destinationValue: draft.destinationValue.trim(),
              destinationLabel: draft.destinationLabel.trim() || null,
            }
          : {}),
        ...(type.trigger === "delay" ? { delayMinutes: Number(draft.delayMinutes) || 0 } : {}),
        ...(type.trigger === "monthly"
          ? { monthlyTriggerDay: Number(draft.monthlyTriggerDay) || 1 }
          : {}),
      });
      toast.success(`Auto-send saved for ${type.label}`);
      setOpenType(null);
      await load();
    } catch (err) {
      toast.error(partnerReportErr(err, "Failed to save rule"));
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
      await deletePartnerAutomationRule(slug, rule._id);
      toast.success("Auto-send turned off");
      setOpenType(null);
      await load();
    } catch (err) {
      toast.error(partnerReportErr(err, "Failed to remove rule"));
    }
  };

  return (
    <div className="prw-modal-backdrop" role="dialog" aria-modal="true">
      <div className="prw-modal">
        <header className="prw-modal-head">
          <div>
            <h2>
              <FiClock size={15} /> Auto-send — {providerLabel}
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
            <FiInfo size={13} /> A per-assignment rule fires once that assignment&apos;s due
            date plus the delay has passed. The delay is what gives marking time to finish, so
            the report is not sent claiming nothing was graded. Nothing is ever sent twice.
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
                        {type.trigger === "monthly"
                          ? `Fires on day ${rule.monthlyTriggerDay} of each month.`
                          : `Fires ${rule.delayMinutes} minute(s) after each assignment's due date.`}
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

                        {type.trigger === "delay" && (
                          <label className="prw-field">
                            <span>Send this long after the due date (minutes)</span>
                            <input
                              className="prw-input"
                              type="number"
                              min="0"
                              value={draft.delayMinutes}
                              onChange={(e) =>
                                setDraft({ ...draft, delayMinutes: e.target.value })
                              }
                            />
                          </label>
                        )}

                        {type.trigger === "monthly" && (
                          <label className="prw-field">
                            <span>Day of the month to send on (1–28)</span>
                            <input
                              className="prw-input"
                              type="number"
                              min="1"
                              max="28"
                              value={draft.monthlyTriggerDay}
                              onChange={(e) =>
                                setDraft({ ...draft, monthlyTriggerDay: e.target.value })
                              }
                            />
                          </label>
                        )}

                        {type.needsDestination && (
                          <>
                            <label className="prw-field">
                              <span>Send to</span>
                              <select
                                className="prw-input"
                                value={draft.destinationType}
                                onChange={(e) =>
                                  setDraft({ ...draft, destinationType: e.target.value })
                                }
                              >
                                <option value="group">WhatsApp group</option>
                                <option value="phone">Phone number</option>
                              </select>
                            </label>
                            <label className="prw-field">
                              <span>
                                {draft.destinationType === "group"
                                  ? "Group id (ends in @g.us)"
                                  : "Phone number"}
                              </span>
                              <input
                                className="prw-input"
                                placeholder={
                                  draft.destinationType === "group"
                                    ? "1234567890@g.us"
                                    : "01234567890"
                                }
                                value={draft.destinationValue}
                                onChange={(e) =>
                                  setDraft({ ...draft, destinationValue: e.target.value })
                                }
                              />
                            </label>
                            <label className="prw-field">
                              <span>Label (optional, for the send history)</span>
                              <input
                                className="prw-input"
                                placeholder="e.g. Physics teachers group"
                                value={draft.destinationLabel}
                                onChange={(e) =>
                                  setDraft({ ...draft, destinationLabel: e.target.value })
                                }
                              />
                            </label>
                          </>
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
