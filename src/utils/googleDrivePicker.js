/**
 * Google sign-in → personal Drive PDF chooser.
 *
 * 1) Backend OAuth popup (/api/google/drive-auth) — account picker / login
 * 2) Official Google Picker when developerKey is configured
 * 3) Otherwise list My Drive PDFs with the signed-in token
 */

function loadScriptOnce(src, globalCheck) {
  if (typeof globalCheck === "function" && globalCheck()) {
    return Promise.resolve();
  }
  const existing = document.querySelector(`script[src="${src}"]`);
  if (existing) {
    return new Promise((resolve, reject) => {
      if (typeof globalCheck === "function" && globalCheck()) return resolve();
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () =>
        reject(new Error(`Failed to load ${src}`))
      );
    });
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.body.appendChild(script);
  });
}

async function ensureGooglePickerLoaded() {
  await loadScriptOnce(
    "https://apis.google.com/js/api.js",
    () => typeof window.gapi !== "undefined"
  );

  await new Promise((resolve, reject) => {
    if (window.google?.picker) {
      resolve();
      return;
    }
    window.gapi.load("picker", {
      callback: () => resolve(),
      onerror: () => reject(new Error("Failed to load Google Picker")),
    });
  });
}

/**
 * Opens Google account picker via backend OAuth popup and returns
 * { accessToken, email } for the teacher's personal Drive.
 */
export async function requestGoogleDriveAccessToken({
  apiBase,
  hintEmail,
} = {}) {
  const base = String(
    apiBase || import.meta.env.VITE_API_BASE_URL || "http://localhost:6001/api"
  ).replace(/\/$/, "");

  const params = new URLSearchParams({
    openerOrigin: window.location.origin,
  });
  if (hintEmail) params.set("email", String(hintEmail).trim());

  const url = `${base}/google/drive-auth?${params.toString()}`;

  return new Promise((resolve, reject) => {
    const popup = window.open(
      url,
      "sahahly-drive-oauth",
      "width=520,height=720"
    );

    if (!popup) {
      reject(
        new Error(
          "Pop-up blocked. Allow pop-ups for this site, then try again."
        )
      );
      return;
    }

    let settled = false;
    const cleanup = () => {
      window.removeEventListener("message", onMessage);
      clearInterval(closedTimer);
    };

    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      cleanup();
      try {
        popup.close();
      } catch {
        /* ignore */
      }
      fn(value);
    };

    const onMessage = (event) => {
      const data = event?.data;
      if (!data || data.type !== "SAHAHLY_DRIVE_OAUTH") return;
      if (data.error) {
        finish(reject, new Error(String(data.error)));
        return;
      }
      if (!data.accessToken) {
        finish(reject, new Error("Google sign-in did not return an access token"));
        return;
      }
      finish(resolve, {
        accessToken: data.accessToken,
        email: data.email || null,
      });
    };

    window.addEventListener("message", onMessage);

    const closedTimer = setInterval(() => {
      if (!popup.closed || settled) return;
      clearInterval(closedTimer);
      // Allow postMessage from the closing popup to arrive first.
      setTimeout(() => {
        if (!settled) {
          finish(reject, new Error("Google sign-in was cancelled"));
        }
      }, 900);
    }, 500);
  });
}

/**
 * Official Google Drive popup (My Drive). Requires a browser API key
 * with the Picker API enabled on the same Cloud project as the OAuth client.
 */
export async function openGoogleDrivePdfPicker({
  accessToken,
  developerKey,
  appId,
  title = "Choose a PDF from Google Drive",
} = {}) {
  if (!accessToken) {
    throw new Error("Missing Google Drive access token");
  }
  if (!developerKey) {
    throw new Error("Google Picker API key is not configured");
  }

  await ensureGooglePickerLoaded();

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    try {
      const myDrive = new window.google.picker.DocsView(
        window.google.picker.ViewId.DOCS
      )
        .setIncludeFolders(true)
        .setSelectFolderEnabled(false)
        .setOwnedByMe(true)
        .setMimeTypes("application/pdf");

      const pdfs = new window.google.picker.DocsView(
        window.google.picker.ViewId.PDFS
      )
        .setIncludeFolders(true)
        .setSelectFolderEnabled(false)
        .setOwnedByMe(true);

      const recent = new window.google.picker.DocsView(
        window.google.picker.ViewId.RECENTLY_PICKED
      ).setMimeTypes("application/pdf");

      const builder = new window.google.picker.PickerBuilder()
        .addView(myDrive)
        .addView(pdfs)
        .addView(recent)
        .setOAuthToken(accessToken)
        .setDeveloperKey(developerKey)
        .setTitle(title)
        .setCallback((data) => {
          const action = data[window.google.picker.Response.ACTION];
          if (action === window.google.picker.Action.PICKED) {
            const doc = data[window.google.picker.Response.DOCUMENTS]?.[0];
            if (!doc) {
              finish(null);
              return;
            }
            const mimeType = doc[window.google.picker.Document.MIME_TYPE] || "";
            if (mimeType && mimeType !== "application/pdf") {
              reject(new Error("Please choose a PDF file"));
              return;
            }
            finish({
              id: doc[window.google.picker.Document.ID],
              name: doc[window.google.picker.Document.NAME] || "worksheet.pdf",
              url:
                doc[window.google.picker.Document.URL] ||
                `https://drive.google.com/file/d/${
                  doc[window.google.picker.Document.ID]
                }/view`,
              mimeType: mimeType || "application/pdf",
            });
            return;
          }
          if (action === window.google.picker.Action.CANCEL) {
            finish(null);
          }
        });

      if (appId) {
        builder.setAppId(String(appId));
      }

      const picker = builder.build();
      picker.setVisible(true);
    } catch (err) {
      reject(err);
    }
  });
}

/** List PDFs in the signed-in teacher's personal My Drive. */
export async function listPersonalDrivePdfs(
  accessToken,
  { q = "", pageToken = null, pageSize = 40 } = {}
) {
  if (!accessToken) throw new Error("Missing Google Drive access token");

  const clauses = ["mimeType='application/pdf'", "trashed=false"];
  const term = String(q || "").trim().replace(/'/g, "\\'");
  if (term) clauses.push(`name contains '${term}'`);

  const params = new URLSearchParams({
    pageSize: String(pageSize),
    spaces: "drive",
    corpora: "user",
    orderBy: "modifiedTime desc",
    fields: "nextPageToken, files(id, name, modifiedTime, webViewLink, mimeType)",
    q: clauses.join(" and "),
  });
  if (pageToken) params.set("pageToken", pageToken);

  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?${params.toString()}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      body?.error?.message || `Drive list failed (${res.status})`
    );
  }

  const data = await res.json();
  return {
    files: data.files || [],
    nextPageToken: data.nextPageToken || null,
  };
}

/** Download a Drive PDF as a browser File for assignment upload. */
export async function downloadDrivePdfAsFile(accessToken, { id, name } = {}) {
  if (!accessToken || !id) {
    throw new Error("Missing Drive file or access token");
  }

  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
      id
    )}?alt=media`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!res.ok) {
    throw new Error("Could not download that PDF from Google Drive");
  }

  const blob = await res.blob();
  const base = String(name || "worksheet.pdf").trim() || "worksheet.pdf";
  const fileName = /\.pdf$/i.test(base) ? base : `${base}.pdf`;
  return new File([blob], fileName, { type: "application/pdf" });
}
