import { useState } from "react";
import { toast } from "react-toastify";
import "./confirmToast.css";

function PromptToastContent({
  message,
  title,
  defaultValue,
  placeholder,
  confirmLabel,
  cancelLabel,
  closeToast,
  resolve,
}) {
  const [value, setValue] = useState(defaultValue);

  const submit = () => {
    const trimmed = value.trim();
    closeToast();
    resolve(trimmed || null);
  };

  return (
    <div className="confirm-toast">
      {title ? <div className="confirm-toast-title">{title}</div> : null}
      <div className="confirm-toast-message">{message}</div>
      <input
        className="confirm-toast-input"
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") {
            closeToast();
            resolve(null);
          }
        }}
        autoFocus
      />
      <div className="confirm-toast-actions">
        <button
          type="button"
          className="confirm-toast-btn confirm-toast-btn--cancel"
          onClick={() => {
            closeToast();
            resolve(null);
          }}
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          className="confirm-toast-btn confirm-toast-btn--confirm"
          onClick={submit}
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  );
}

/**
 * In-app confirmation via react-toastify (replaces window.confirm).
 * Returns a promise that resolves true (confirm) or false (cancel).
 */
export function confirmToast(message, options = {}) {
  const {
    title = null,
    confirmLabel = "Confirm",
    cancelLabel = "Cancel",
    danger = false,
    toastId = "confirm-dialog",
  } = options;

  return new Promise((resolve) => {
    if (toastId && toast.isActive(toastId)) {
      resolve(false);
      return;
    }

    toast(
      ({ closeToast }) => (
        <div className="confirm-toast">
          {title ? <div className="confirm-toast-title">{title}</div> : null}
          <div className="confirm-toast-message">{message}</div>
          <div className="confirm-toast-actions">
            <button
              type="button"
              className="confirm-toast-btn confirm-toast-btn--cancel"
              onClick={() => {
                closeToast();
                resolve(false);
              }}
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              className={`confirm-toast-btn ${
                danger ? "confirm-toast-btn--danger" : "confirm-toast-btn--confirm"
              }`}
              onClick={() => {
                closeToast();
                resolve(true);
              }}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      ),
      {
        toastId,
        autoClose: false,
        closeOnClick: false,
        draggable: false,
        closeButton: false,
        className: "confirm-toast-container",
      }
    );
  });
}

/**
 * In-app text prompt via react-toastify (replaces window.prompt).
 * Returns trimmed string or null if cancelled / empty.
 */
export function promptToast(message, options = {}) {
  const {
    title = null,
    defaultValue = "",
    placeholder = "",
    confirmLabel = "Save",
    cancelLabel = "Cancel",
  } = options;

  return new Promise((resolve) => {
    toast(
      ({ closeToast }) => (
        <PromptToastContent
          message={message}
          title={title}
          defaultValue={defaultValue}
          placeholder={placeholder}
          confirmLabel={confirmLabel}
          cancelLabel={cancelLabel}
          closeToast={closeToast}
          resolve={resolve}
        />
      ),
      {
        autoClose: false,
        closeOnClick: false,
        draggable: false,
        closeButton: false,
        className: "confirm-toast-container",
      }
    );
  });
}
