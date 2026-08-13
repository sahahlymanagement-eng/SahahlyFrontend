import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-toastify";
import { FiAlertTriangle, FiSend } from "react-icons/fi";
import * as wbApi from "../../api/whatsappBroadcasts";
import { wbErr } from "../../api/whatsappBroadcasts";
import BroadcastComposer from "../../components/whatsappBroadcast/BroadcastComposer";
import RecipientImportPanel from "../../components/whatsappBroadcast/RecipientImportPanel";
import BroadcastProgress from "../../components/whatsappBroadcast/BroadcastProgress";
import BroadcastsTable from "../../components/whatsappBroadcast/BroadcastsTable";
import { formatDateTime, formatDuration } from "../../components/whatsappBroadcast/format";
import "../../components/whatsappScheduler/whatsappScheduler.css";
import "../../components/whatsappBroadcast/broadcast.css";

const emptyForm = { title: "", text: "", attachment: null };

/**
 * `crypto.randomUUID` only exists in a secure context, so it is undefined when the
 * dev server is opened over a plain-http LAN address. Any unique string works here —
 * it only has to be stable for one compose session.
 */
function newRequestId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `wbc-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Typed into the send gate to arm the button. A blast has no undo. */
const CONFIRM_WORD = "SEND";

export default function WhatsAppBroadcast() {
  const [form, setForm] = useState(emptyForm);
  const [preview, setPreview] = useState(null);
  const [recipients, setRecipients] = useState([]);
  const [importing, setImporting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);

  const [confirmText, setConfirmText] = useState("");
  const [testPhone, setTestPhone] = useState("");

  const [broadcasts, setBroadcasts] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailRecipients, setDetailRecipients] = useState([]);
  const [recipientFilter, setRecipientFilter] = useState("");

  // One id per compose session. It is what makes a double-clicked Send return the
  // campaign that already exists instead of creating a second one.
  const clientRequestId = useRef(newRequestId());

  const patchForm = useCallback((patch) => setForm((prev) => ({ ...prev, ...patch })), []);

  const sampleName = useMemo(
    () => recipients.find((r) => r.name)?.name || "",
    [recipients]
  );

  // Fetchers are pure — they return data and never touch state, which keeps the
  // effects below free of synchronous setState and lets each caller decide whether
  // a late response still matters.
  const fetchDetail = useCallback(
    (id, status) =>
      Promise.all([
        wbApi.getBroadcast(id),
        wbApi.listRecipients(id, { limit: 200, ...(status ? { status } : {}) }),
      ]),
    []
  );

  // Reloads triggered by a user action (the refresh button, after a mutation).
  const loadList = useCallback(async () => {
    setLoadingList(true);
    try {
      const data = await wbApi.listBroadcasts({ limit: 20 });
      setBroadcasts(data.broadcasts || []);
    } catch (err) {
      toast.error(wbErr(err, "Could not load broadcasts"));
    } finally {
      setLoadingList(false);
    }
  }, []);

  const loadDetail = useCallback(async () => {
    if (!selectedId) return;
    try {
      const [d, r] = await fetchDetail(selectedId, recipientFilter);
      setDetail(d);
      setDetailRecipients(r.recipients || []);
      // Keep the list's counters in step with the live view.
      setBroadcasts((prev) => prev.map((b) => (b._id === d.broadcast._id ? d.broadcast : b)));
    } catch (err) {
      toast.error(wbErr(err, "Could not load this broadcast"));
    }
  }, [selectedId, recipientFilter, fetchDetail]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await wbApi.listBroadcasts({ limit: 20 });
        if (alive) setBroadcasts(data.broadcasts || []);
      } catch (err) {
        if (alive) toast.error(wbErr(err, "Could not load broadcasts"));
      } finally {
        if (alive) setLoadingList(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // `alive` also drops a superseded response: switch broadcasts or filters quickly
  // and the slower first request must not overwrite the newer view.
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!selectedId) {
        if (alive) {
          setDetail(null);
          setDetailRecipients([]);
        }
        return;
      }
      try {
        const [d, r] = await fetchDetail(selectedId, recipientFilter);
        if (!alive) return;
        setDetail(d);
        setDetailRecipients(r.recipients || []);
        setBroadcasts((prev) => prev.map((b) => (b._id === d.broadcast._id ? d.broadcast : b)));
      } catch (err) {
        if (alive) toast.error(wbErr(err, "Could not load this broadcast"));
      }
    })();
    return () => {
      alive = false;
    };
  }, [selectedId, recipientFilter, fetchDetail]);

  // ── Recipients ────────────────────────────────────────────────────────────

  const handleSheet = async (file) => {
    setImporting(true);
    try {
      const data = await wbApi.previewRecipients(file);
      setPreview(data);
      setRecipients(data.valid || []);
      if (!data.validCount) {
        toast.warn("No sendable numbers found — check the “Cannot be sent” tab");
      } else {
        toast.success(`${data.validCount} recipient(s) ready to review`);
      }
    } catch (err) {
      toast.error(wbErr(err, "Could not read that sheet"));
    } finally {
      setImporting(false);
    }
  };

  const removeRecipient = (phoneDigits) =>
    setRecipients((prev) => prev.filter((r) => r.phoneDigits !== phoneDigits));

  const clearRecipients = () => {
    setPreview(null);
    setRecipients([]);
    setConfirmText("");
  };

  // ── Attachment ────────────────────────────────────────────────────────────

  const handlePickAttachment = async (file) => {
    setUploading(true);
    try {
      const saved = await wbApi.uploadAttachment(file);
      patchForm({ attachment: saved });
      return saved;
    } catch (err) {
      toast.error(wbErr(err, "Upload failed"));
      return null;
    } finally {
      setUploading(false);
    }
  };

  // ── Send ──────────────────────────────────────────────────────────────────

  const canSend =
    recipients.length > 0 && (form.text.trim() || form.attachment) && !busy && !importing;

  const submit = async (confirmDuplicateSheet = false) => {
    setBusy(true);
    try {
      const data = await wbApi.createBroadcast({
        title: form.title.trim() || null,
        text: form.text,
        attachmentId: form.attachment?.attachmentId ?? null,
        recipients: recipients.map((r) => ({
          name: r.name,
          phone: r.rawPhone,
          rowNumber: r.rowNumber,
        })),
        clientRequestId: clientRequestId.current,
        sourceFilename: preview?.sourceFilename ?? null,
        sourceHash: preview?.sourceHash ?? null,
        confirmDuplicateSheet,
      });

      if (data.replay) {
        toast.info("This broadcast was already created");
      } else {
        toast.success(
          `Broadcast started — ${data.recipientCount} recipient(s), finishing around ${formatDateTime(
            data.estimatedFinishAt
          )}`
        );
      }

      // Fresh id so the next compose session isn't treated as a replay of this one.
      clientRequestId.current = newRequestId();
      setForm(emptyForm);
      clearRecipients();
      setSelectedId(data.broadcast._id);
      await loadList();
    } catch (err) {
      if (err?.response?.status === 409 && err.response.data?.code === "duplicate_sheet") {
        const when = err.response.data.recentBroadcasts?.[0]?.createdAt;
        const ok = window.confirm(
          `This exact sheet was already broadcast${
            when ? ` on ${new Date(when).toLocaleDateString()}` : " recently"
          }.\n\nSending again will message these people a second time. Continue?`
        );
        if (ok) {
          setBusy(false);
          return submit(true);
        }
      } else {
        toast.error(wbErr(err, "Could not start the broadcast"));
      }
    } finally {
      setBusy(false);
    }
  };

  const handleTestSend = async () => {
    if (!testPhone.trim()) {
      toast.warn("Enter a number to send the test to");
      return;
    }
    setBusy(true);
    try {
      // A test needs a broadcast to hang off, so it runs against the selected one.
      if (!selectedId) {
        toast.info("Start a broadcast first, then send yourself a test from its progress view");
        return;
      }
      const out = await wbApi.testSend(selectedId, testPhone.trim(), sampleName);
      toast[out.skipped ? "warn" : "success"](
        out.skipped ? "Skipped — that test was already sent" : "Test message sent"
      );
    } catch (err) {
      toast.error(wbErr(err, "Test send failed"));
    } finally {
      setBusy(false);
    }
  };

  // ── Controls on the selected broadcast ────────────────────────────────────

  const runControl = async (fn, successMessage) => {
    setBusy(true);
    try {
      await fn();
      if (successMessage) toast.success(successMessage);
      await loadDetail();
      await loadList();
    } catch (err) {
      toast.error(wbErr(err, "That didn't work"));
    } finally {
      setBusy(false);
    }
  };

  return (
    // `ast-page` is what the shell styles against (`.ast-main > .ast-page` in
    // assistant.css) — it supplies the padding, max-width and scroll container.
    // Without it the page renders unpadded and full-bleed.
    <div className="ast-page mws-page">
      <header className="mws-page-header">
        <h1 className="mws-page-title">WhatsApp Broadcast</h1>
        <p className="mws-page-subtitle">
          Write one message, upload a sheet of names and numbers, and send it to everyone as
          individual WhatsApp messages.
        </p>
      </header>

      <BroadcastComposer
        title={form.title}
        text={form.text}
        attachment={form.attachment}
        busy={busy}
        uploading={uploading}
        sampleName={sampleName}
        onChange={patchForm}
        onPickAttachment={handlePickAttachment}
        onRemoveAttachment={() => patchForm({ attachment: null })}
      />

      <RecipientImportPanel
        preview={preview}
        recipients={recipients}
        importing={importing}
        disabled={busy}
        onFile={handleSheet}
        onRemoveRecipient={removeRecipient}
        onClear={clearRecipients}
      />

      {/* The send gate. Everything above is reversible; this is the point of no return,
          so it restates what is about to happen and needs the word typed out. */}
      <section className="mws-card">
        <div className="mws-card-header">
          <h2 className="mws-card-title">
            <FiSend size={15} /> Send
          </h2>
        </div>

        {!canSend ? (
          <p className="mws-empty">
            Add a message {form.attachment ? "" : "or an attachment "}and upload a sheet of
            recipients to enable sending.
          </p>
        ) : (
          <div className="wbc-gate">
            <p className="wbc-gate-headline">
              About to message {recipients.length} {recipients.length === 1 ? "person" : "people"}
              , one at a time.
            </p>
            <ul className="wbc-gate-list">
              <li>
                Messages are paced deliberately slowly to protect the number from being
                banned — this will take{" "}
                <strong>{formatDuration(recipients.length * 8000)}</strong>, sending
                continuously until it finishes.
              </li>
              <li>
                You can <strong>pause</strong> or <strong>cancel</strong> at any point, but
                messages already delivered <strong>cannot be recalled</strong>.
              </li>
              <li>
                Anyone who received a different broadcast in the last 24 hours is skipped
                automatically.
              </li>
            </ul>

            <div className="mws-field">
              <label className="mws-label" htmlFor="wbc-confirm">
                Type <code>{CONFIRM_WORD}</code> to confirm
              </label>
              <input
                id="wbc-confirm"
                className="mws-input mws-input--mono"
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={CONFIRM_WORD}
                disabled={busy}
              />
            </div>

            <div className="wbc-actions">
              <button
                type="button"
                className="mws-btn mws-btn--primary"
                onClick={() => submit(false)}
                disabled={busy || confirmText.trim().toUpperCase() !== CONFIRM_WORD}
              >
                <FiSend aria-hidden="true" />
                {busy ? "Starting…" : `Send to ${recipients.length}`}
              </button>
              {confirmText.trim().toUpperCase() !== CONFIRM_WORD ? (
                <span className="mws-note">
                  <FiAlertTriangle aria-hidden="true" /> Type {CONFIRM_WORD} above to enable
                </span>
              ) : null}
            </div>
          </div>
        )}
      </section>

      {detail ? (
        <BroadcastProgress
          detail={detail}
          recipients={detailRecipients}
          recipientFilter={recipientFilter}
          busy={busy}
          onRefresh={loadDetail}
          onFilterChange={setRecipientFilter}
          onPause={() => runControl(() => wbApi.pauseBroadcast(selectedId), "Paused")}
          onResume={() => runControl(() => wbApi.resumeBroadcast(selectedId), "Resumed")}
          onCancel={() => runControl(() => wbApi.cancelBroadcast(selectedId), "Cancelled")}
          onRetryFailed={() => runControl(() => wbApi.retryFailed(selectedId), "Failed rows re-queued")}
          onDelete={async () => {
            if (!window.confirm("Delete this broadcast and its recipient list?")) return;
            await runControl(() => wbApi.deleteBroadcast(selectedId), "Deleted");
            setSelectedId(null);
          }}
        />
      ) : null}

      {/* Test send lives beside the live view: it needs a broadcast to render against,
          and seeing the real message on your own phone is the last cheap check. */}
      {detail ? (
        <section className="mws-card">
          <div className="mws-card-header">
            <h2 className="mws-card-title">Send yourself a test</h2>
          </div>
          <div className="wbc-test-row">
            <div className="mws-field">
              <label className="mws-label" htmlFor="wbc-test-phone">
                Your number
              </label>
              <input
                id="wbc-test-phone"
                className="mws-input mws-input--mono"
                type="tel"
                value={testPhone}
                placeholder="01012345678"
                onChange={(e) => setTestPhone(e.target.value)}
                disabled={busy}
              />
            </div>
            <button
              type="button"
              className="mws-btn mws-btn--ghost"
              onClick={handleTestSend}
              disabled={busy}
            >
              <FiSend aria-hidden="true" /> Send test
            </button>
          </div>
          <p className="mws-note">
            Sends this broadcast’s exact message and attachment to one number, through the
            same path the real send uses.
          </p>
        </section>
      ) : null}

      <BroadcastsTable
        broadcasts={broadcasts}
        loading={loadingList}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onRefresh={loadList}
      />
    </div>
  );
}
