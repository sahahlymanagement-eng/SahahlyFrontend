import { FiMessageSquare } from "react-icons/fi";
import BroadcastAttachmentPicker from "./BroadcastAttachmentPicker";

/**
 * The message itself: a title for your own reference, the body, and one optional
 * attachment everyone receives.
 *
 * Two placeholders, substituted per recipient:
 *   {{name}}    — whoever the message is addressed to.
 *   {{student}} — the student it is about. On a send to parents those are two
 *                 different people, which is what makes "your son Omar scored…"
 *                 writable once for a whole class. It falls back to {{name}} when
 *                 the list has no student behind it, as a sheet import never does.
 *
 * A recipient with no name gets an empty string, which is why the live preview
 * shows the rendered result rather than the raw template.
 */
export default function BroadcastComposer({
  title,
  text,
  attachment,
  busy,
  uploading,
  sampleName,
  sampleStudent,
  onChange,
  onPickAttachment,
  onRemoveAttachment,
}) {
  const usesName = /\{\{\s*(name|student)\s*\}\}/i.test(text || "");
  const rendered = (text || "")
    .replace(/\{\{\s*name\s*\}\}/gi, sampleName || "")
    .replace(/\{\{\s*student\s*\}\}/gi, sampleStudent || sampleName || "");

  return (
    <section className="mws-card">
      <div className="mws-card-header">
        <h2 className="mws-card-title">
          <FiMessageSquare size={15} /> Message
        </h2>
      </div>

      <div className="mws-field">
        <label className="mws-label" htmlFor="wbc-title">
          Name this broadcast
          <span className="mws-charcount">for your reference only</span>
        </label>
        <input
          id="wbc-title"
          className="mws-input"
          type="text"
          maxLength={200}
          value={title}
          placeholder="e.g. September fee reminder"
          onChange={(e) => onChange({ title: e.target.value })}
          disabled={busy}
        />
      </div>

      <div className="mws-field mws-field--wide">
        <label className="mws-label" htmlFor="wbc-text">
          {attachment ? "Caption" : "Message"}
          <span className="mws-charcount">{(text || "").length} characters</span>
        </label>
        <textarea
          id="wbc-text"
          className="mws-textarea"
          rows={6}
          value={text}
          placeholder={
            attachment
              ? "Caption sent with the file. Type {{name}} to personalise it."
              : "Type your message. Use {{name}} for the recipient and {{student}} for the student it's about."
          }
          onChange={(e) => onChange({ text: e.target.value })}
          disabled={busy}
        />
        <p className="mws-note">
          Type <code>{"{{name}}"}</code> to insert the recipient’s name, and{" "}
          <code>{"{{student}}"}</code> for the student the message is about — on a send to
          parents those are two different people.
          {usesName ? null : " Leave them out and everyone gets the identical message."}
        </p>
      </div>

      {text ? (
        <div className="wbc-preview">
          <span className="wbc-preview-label">
            Preview{sampleName ? ` — as ${sampleName} will see it` : ""}
          </span>
          <div className="wbc-bubble">{rendered || <em>(empty message)</em>}</div>
          {usesName ? (
            <p className="mws-note">
              Anyone whose row has no name will see that space blank — check the “Cannot be
              sent” and name columns if that matters.
            </p>
          ) : null}
        </div>
      ) : null}

      <BroadcastAttachmentPicker
        attachment={attachment}
        busy={busy}
        uploading={uploading}
        onPick={onPickAttachment}
        onRemove={onRemoveAttachment}
      />
    </section>
  );
}
