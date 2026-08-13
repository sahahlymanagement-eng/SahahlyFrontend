import { FiMessageSquare } from "react-icons/fi";
import BroadcastAttachmentPicker from "./BroadcastAttachmentPicker";

/**
 * The message itself: a title for your own reference, the body, and one optional
 * attachment everyone receives.
 *
 * `{{name}}` is the only placeholder. It is substituted per recipient from the name
 * column in the sheet, and a recipient with no name gets an empty string — which is
 * why the live preview below shows the rendered result rather than the raw template.
 */
export default function BroadcastComposer({
  title,
  text,
  attachment,
  busy,
  uploading,
  sampleName,
  onChange,
  onPickAttachment,
  onRemoveAttachment,
}) {
  const usesName = /\{\{\s*name\s*\}\}/i.test(text || "");
  const rendered = (text || "").replace(/\{\{\s*name\s*\}\}/gi, sampleName || "");

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
              : "Type your message. Use {{name}} to insert each person's name from the sheet."
          }
          onChange={(e) => onChange({ text: e.target.value })}
          disabled={busy}
        />
        <p className="mws-note">
          Type <code>{"{{name}}"}</code> anywhere to insert the name from the sheet.
          {usesName ? null : " Leave it out and everyone gets the identical message."}
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
