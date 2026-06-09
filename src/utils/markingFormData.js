/** Attach user/assignment context so the backend can log AI token usage. */

export function appendMarkingContext(formData, { personId, assignmentId, classroomId } = {}) {

  if (personId) formData.append("personId", personId);

  if (assignmentId) formData.append("assignmentId", assignmentId);

  if (classroomId) formData.append("classroomId", classroomId);

}



export function currentUserId() {

  try {

    const user = JSON.parse(localStorage.getItem("user") || "{}");

    return user?.id || null;

  } catch {

    return null;

  }

}



/** Coerce guidance/prompt values to a safe trimmed string. */

export function normalizeGuidance(value) {

  if (value == null) return "";

  if (typeof value === "string") return value.trim();

  return String(value).trim();

}



/** Return trimmed guidance for FormData, or null when empty. */

export function guidanceForForm(value) {

  const text = normalizeGuidance(value);

  return text || null;

}



/** Read a useful API error message (including JSON-in-blob error bodies). */

export async function getApiErrorMessage(err) {

  const data = err?.response?.data;

  if (data instanceof Blob) {

    try {

      const text = await data.text();

      try {

        const parsed = JSON.parse(text);

        return parsed.message || text || err.message;

      } catch {

        return text || err.message;

      }

    } catch {

      return err.message || "Request failed";

    }

  }

  if (data && typeof data === "object" && data.message) return data.message;

  return err?.message || "Request failed";

}



/** Ensure a downloaded blob is a real PDF before sending to marking. */

export async function assertPdfBlob(blob, label = "PDF") {

  if (!(blob instanceof Blob)) {

    throw new Error(`${label}: invalid file response`);

  }



  if (blob.size < 100) {

    let message = `${label}: file is missing or empty`;

    try {

      const text = await blob.text();

      const parsed = JSON.parse(text);

      if (parsed.message) message = parsed.message;

    } catch {

      // keep default message

    }

    throw new Error(message);

  }



  const head = await blob.slice(0, 4).text();

  if (!head.startsWith("%PDF")) {

    throw new Error(`${label}: no PDF attachment found for this submission`);

  }

}


